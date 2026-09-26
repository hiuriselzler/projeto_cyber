//! Block edits — extending, shortening, a cycle's length and a strategy switched mid-block (task 005,
//! stage 3b; FR-3.1a, FR-3.1c, FR-3.6a).
//!
//! Each returns the edited plan or a [`Refusal`], and **never a half-edited plan**: every check runs
//! before anything changes. The rules are 01 FR-3.1c's and the stage's seven decisions:
//! - a cycle that has **started** — `in_progress`, `completed`, `skipped`, or holding a logged set,
//!   whatever its status says — is never dropped, moved or re-projected (INV-06);
//! - `extend` and `switch_rule` project, so they refuse a plan stamped by a newer engine, as `reconcile`
//!   yields to one; `shorten` and `relength` project nothing and are the user's own edits;
//! - the wrappers archive what a shorten drops (INV-11) and mint ids for what an extension adds.

use std::collections::{BTreeMap, BTreeSet};

use super::ENGINE_VERSION;
use super::dates::{MAX_LENGTH_DAYS, MIN_LENGTH_DAYS, clamp_length};
use super::deload::deload_schedule;
use super::generate::place;
use super::plan::{
    CycleStatus, MAX_MICROCYCLES, MesocycleSpec, PlanCycle, PlanExercise, PlanLog, PlanSession,
    Reconciled, Rule, SetOrigin, WriteKind,
};
use super::reconcile::reconcile;

/// The fewest microcycles a block may hold (FR-3.1).
const MIN_MICROCYCLES: u32 = 2;

/// Why a block edit was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefusalReason {
    /// The plan holds a cycle projected by a newer engine; this engine may not project over it (INV-06).
    NewerEngine,
    /// A cycle the edit would drop or move has started (INV-06).
    Started,
    /// Shortening would drop a locked cycle; the user unlocks it first (stage 3b, decision 2).
    Locked,
    /// The cycle whose length would change is `completed` or `skipped`: its length is history.
    History,
    /// A session would fall past the cycle's new end (03 §5); the user moves it first.
    SessionDoesNotFit,
    /// A block length outside 2–52 cycles, or a cycle length outside 1–28 days (FR-3.1, FR-3.1a).
    OutOfRange,
    NoSuchCycle,
    NoSuchExercise,
}

/// A refused edit: why, and where. `cycle_number` names the cycle that stopped it; `day_index` the
/// session that would not fit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Refusal {
    pub reason: RefusalReason,
    pub cycle_number: Option<u32>,
    pub day_index: Option<u32>,
}

impl RefusalReason {
    /// The name this reason carries in the shared fixtures and both bindings.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::NewerEngine => "newer_engine",
            Self::Started => "started",
            Self::Locked => "locked",
            Self::History => "history",
            Self::SessionDoesNotFit => "session_does_not_fit",
            Self::OutOfRange => "out_of_range",
            Self::NoSuchCycle => "no_such_cycle",
            Self::NoSuchExercise => "no_such_exercise",
        }
    }
}

const fn refused(reason: RefusalReason, cycle_number: Option<u32>) -> Refusal {
    Refusal {
        reason,
        cycle_number,
        day_index: None,
    }
}

/// What `shorten` returns: the cycles kept, and the numbers of those dropped, for the wrapper to archive.
#[derive(Debug, Clone, PartialEq)]
pub struct Shortened {
    pub cycles: Vec<PlanCycle>,
    pub dropped: Vec<u32>,
}

/// FR-3.1c — lengthen a block to `to` cycles, appending projected cycles and changing nothing before
/// them (decision 1).
///
/// The new cycles are laid out from **cycle 1's structure**, by the same rule `generate` uses for a
/// shorter cycle; each exercise takes the rule, increment and body weight of **its latest row**, so a
/// strategy switched mid-block carries on. Lengths come from the mesocycle's default and overrides, and
/// deload flags from its policy, for the new cycles only. Their prescriptions are what `reconcile` would
/// give them, stepping from each exercise's anchor. So a freshly generated block extended to `to` matches
/// one generated that long, from the first new cycle on.
///
/// # Errors
/// [`RefusalReason::NewerEngine`] for a plan stamped by a newer engine; [`RefusalReason::OutOfRange`]
/// past 52 cycles or below the plan's own length.
pub fn extend(
    mesocycle: &MesocycleSpec,
    plan: &[PlanCycle],
    logs: &[PlanLog],
    today: super::EpochDay,
    to: u32,
) -> Result<Vec<PlanCycle>, Refusal> {
    refuse_newer(plan)?;
    let cycles = sorted(plan);
    let count = u32::try_from(cycles.len()).unwrap_or(u32::MAX);
    if to > MAX_MICROCYCLES || to < count {
        return Err(refused(RefusalReason::OutOfRange, None));
    }
    let (Some(first), Some(last)) = (cycles.first(), cycles.last()) else {
        return Err(refused(RefusalReason::NoSuchCycle, None));
    };
    if to == count {
        return Ok(cycles);
    }

    let deloads = deload_schedule(&mesocycle.deload, to);
    // Cycle 1's structure, each exercise carrying its latest rule — the same for every new cycle.
    let mut seen: BTreeMap<&str, u32> = BTreeMap::new();
    let template: Vec<PlanSession> = first
        .sessions
        .iter()
        .map(|session| PlanSession {
            exercises: session
                .exercises
                .iter()
                .map(|exercise| {
                    let occurrence = seen.entry(exercise.exercise_id.as_str()).or_insert(0);
                    let latest = latest_of(&cycles, exercise, *occurrence);
                    *occurrence += 1;
                    latest
                })
                .collect(),
            ..session.clone()
        })
        .collect();
    let mut extended = cycles.clone();
    let (mut starts_on, mut previous_length) = (last.starts_on, last.length_days);
    for number in count + 1..=to {
        starts_on = starts_on.saturating_add(previous_length.cast_signed());
        let length = length_of(mesocycle, number);
        previous_length = length;
        let keys: Vec<(u32, u32)> = template
            .iter()
            .map(|session| (session.day_index, session.order_index))
            .collect();
        let sessions = place(&keys, length)
            .into_iter()
            .zip(&template)
            .map(|((day_index, order_index), session)| PlanSession {
                day_index,
                order_index,
                exercises: session.exercises.clone(),
            })
            .collect();
        extended.push(PlanCycle {
            cycle_number: number,
            length_days: length,
            starts_on,
            is_deload: deloads
                .get(usize::try_from(number - 1).unwrap_or(usize::MAX))
                .copied()
                .unwrap_or(false),
            status: CycleStatus::Projected,
            engine_version: ENGINE_VERSION,
            last_write_kind: WriteKind::Engine,
            sessions,
        });
    }

    // The new cycles are what `reconcile` gives them; everything before them is returned as it came.
    let projected = reconcile(mesocycle, &extended, logs, today).cycles;
    let mut result = cycles;
    result.extend(
        projected
            .into_iter()
            .filter(|cycle| cycle.cycle_number > count),
    );
    Ok(result)
}

/// FR-3.1c — shorten a block to `to` cycles, dropping trailing ones (decision 2). Only projected cycles
/// with nothing logged may go; a locked cycle is refused so the user unlocks it first. No flag on a kept
/// cycle changes.
///
/// # Errors
/// [`RefusalReason::OutOfRange`] below 2 cycles or above the plan's length; [`RefusalReason::Locked`] or
/// [`RefusalReason::Started`] naming the first cycle that cannot be dropped.
pub fn shorten(plan: &[PlanCycle], logs: &[PlanLog], to: u32) -> Result<Shortened, Refusal> {
    let mut cycles = sorted(plan);
    let count = u32::try_from(cycles.len()).unwrap_or(u32::MAX);
    if to < MIN_MICROCYCLES || to > count {
        return Err(refused(RefusalReason::OutOfRange, None));
    }
    let logged = logged_cycles(logs);
    let keep = usize::try_from(to).unwrap_or(usize::MAX);
    for cycle in &cycles[keep..] {
        if cycle.status == CycleStatus::Locked {
            return Err(refused(RefusalReason::Locked, Some(cycle.cycle_number)));
        }
        if has_started(cycle, &logged) {
            return Err(refused(RefusalReason::Started, Some(cycle.cycle_number)));
        }
    }
    let dropped = cycles
        .split_off(keep)
        .into_iter()
        .map(|cycle| cycle.cycle_number)
        .collect();
    Ok(Shortened { cycles, dropped })
}

/// FR-3.1a, 03 §5 — give one cycle a length of `days`, and walk every later cycle's start to follow it
/// (decision 3). The cycle may be projected, locked or in progress — the travel case — but not history;
/// no later cycle that moves may have started; and no session may fall past the new end, since the
/// engine names sessions by `(day_index, order_index)` and will not guess which row moved. Locked later
/// cycles move: the move is the user's own. Every cycle changed is written as the user's, and no load
/// changes — a cycle's length is not a progression step.
///
/// # Errors
/// [`RefusalReason::OutOfRange`], [`RefusalReason::NoSuchCycle`], [`RefusalReason::History`],
/// [`RefusalReason::SessionDoesNotFit`], or [`RefusalReason::Started`] naming the first later cycle
/// that cannot move.
pub fn relength(
    plan: &[PlanCycle],
    logs: &[PlanLog],
    cycle_number: u32,
    days: u32,
) -> Result<Vec<PlanCycle>, Refusal> {
    if !(MIN_LENGTH_DAYS..=MAX_LENGTH_DAYS).contains(&days) {
        return Err(refused(RefusalReason::OutOfRange, Some(cycle_number)));
    }
    let mut cycles = sorted(plan);
    let Some(at) = cycles.iter().position(|it| it.cycle_number == cycle_number) else {
        return Err(refused(RefusalReason::NoSuchCycle, Some(cycle_number)));
    };
    let cycle = &cycles[at];
    if matches!(cycle.status, CycleStatus::Completed | CycleStatus::Skipped) {
        return Err(refused(RefusalReason::History, Some(cycle_number)));
    }
    if let Some(session) = cycle.sessions.iter().find(|it| it.day_index > days) {
        return Err(Refusal {
            reason: RefusalReason::SessionDoesNotFit,
            cycle_number: Some(cycle_number),
            day_index: Some(session.day_index),
        });
    }
    if cycle.length_days == days {
        return Ok(cycles);
    }
    let logged = logged_cycles(logs);
    if let Some(later) = cycles[at + 1..].iter().find(|it| has_started(it, &logged)) {
        return Err(refused(RefusalReason::Started, Some(later.cycle_number)));
    }

    cycles[at].length_days = days;
    cycles[at].last_write_kind = WriteKind::User;
    for next in at + 1..cycles.len() {
        let starts_on = cycles[next - 1]
            .starts_on
            .saturating_add(cycles[next - 1].length_days.cast_signed());
        if cycles[next].starts_on != starts_on {
            cycles[next].starts_on = starts_on;
            cycles[next].last_write_kind = WriteKind::User;
        }
    }
    Ok(cycles)
}

/// FR-3.6a — put `rule` on one exercise from `from_cycle` on, and reconcile (decision 4). The exercise is
/// named as `reconcile` names it: its `exercise_id` and which occurrence it is in its cycle. The rule goes
/// on every projected cycle with nothing logged from `from_cycle`; locked and started cycles keep theirs.
/// Because every exercise projects from its anchor, the new strategy continues **from the load actually
/// achieved**. Its preview is this same call, not persisted.
///
/// # Errors
/// [`RefusalReason::NewerEngine`] for a plan stamped by a newer engine; [`RefusalReason::NoSuchExercise`]
/// when no cycle holds the exercise.
#[expect(
    clippy::too_many_arguments,
    reason = "reconcile's four arguments and the edit's three; bundling them would only rename them"
)]
pub fn switch_rule(
    mesocycle: &MesocycleSpec,
    plan: &[PlanCycle],
    logs: &[PlanLog],
    today: super::EpochDay,
    exercise_id: &str,
    occurrence: u32,
    from_cycle: u32,
    rule: &Rule,
) -> Result<Reconciled, Refusal> {
    refuse_newer(plan)?;
    let logged = logged_cycles(logs);
    let mut cycles = sorted(plan);
    let mut found = false;
    for cycle in &mut cycles {
        let rewritable = cycle.cycle_number >= from_cycle
            && cycle.status == CycleStatus::Projected
            && !logged.contains(&cycle.cycle_number);
        let nth = cycle
            .sessions
            .iter_mut()
            .flat_map(|session| session.exercises.iter_mut())
            .filter(|exercise| exercise.exercise_id == exercise_id)
            .nth(usize::try_from(occurrence).unwrap_or(usize::MAX));
        if let Some(exercise) = nth {
            found = true;
            if rewritable {
                exercise.rule = rule.clone();
            }
        }
    }
    if !found {
        return Err(refused(RefusalReason::NoSuchExercise, None));
    }
    Ok(reconcile(mesocycle, &cycles, logs, today))
}

fn refuse_newer(plan: &[PlanCycle]) -> Result<(), Refusal> {
    plan.iter()
        .find(|cycle| cycle.engine_version > ENGINE_VERSION)
        .map_or(Ok(()), |cycle| {
            Err(refused(
                RefusalReason::NewerEngine,
                Some(cycle.cycle_number),
            ))
        })
}

/// A cycle has started when its status says so, or when anything is logged in it, whatever its status
/// says — the belt and braces `reconcile` wears too.
fn has_started(cycle: &PlanCycle, logged: &BTreeSet<u32>) -> bool {
    !matches!(cycle.status, CycleStatus::Projected | CycleStatus::Locked)
        || logged.contains(&cycle.cycle_number)
}

fn logged_cycles(logs: &[PlanLog]) -> BTreeSet<u32> {
    logs.iter().map(|log| log.cycle_number).collect()
}

/// The plan's cycles, sessions, exercises and sets in canonical order.
fn sorted(plan: &[PlanCycle]) -> Vec<PlanCycle> {
    let mut cycles: Vec<PlanCycle> = plan.to_vec();
    cycles.sort_by_key(|cycle| cycle.cycle_number);
    for cycle in &mut cycles {
        cycle.sessions = sessions_keyed(cycle);
    }
    cycles
}

fn sessions_keyed(cycle: &PlanCycle) -> Vec<PlanSession> {
    let mut sessions = cycle.sessions.clone();
    sessions.sort_by_key(|session| (session.day_index, session.order_index));
    for session in &mut sessions {
        session
            .exercises
            .sort_by_key(|exercise| exercise.order_index);
        for exercise in &mut session.exercises {
            exercise.sets.sort_by_key(|set| set.set_index);
        }
    }
    sessions
}

/// A new cycle's copy of one of cycle 1's exercises: cycle 1's order, identity and sets as placeholders
/// the walk re-projects, with the rule, increment and body weight of the exercise's **latest** row. The
/// latest is found by `exercise_id` and `occurrence`, as `reconcile` finds "the same exercise".
fn latest_of(cycles: &[PlanCycle], template: &PlanExercise, occurrence: u32) -> PlanExercise {
    let latest = cycles
        .iter()
        .rev()
        .find_map(|cycle| nth_of(cycle, &template.exercise_id, occurrence))
        .unwrap_or(template);
    PlanExercise {
        rule: latest.rule.clone(),
        increment_kg: latest.increment_kg,
        uses_bodyweight: latest.uses_bodyweight,
        body_weight_kg: latest.body_weight_kg,
        sets: template
            .sets
            .iter()
            .map(|set| super::plan::PlanSet {
                origin: SetOrigin::Generated,
                is_pinned: false,
                ..*set
            })
            .collect(),
        ..template.clone()
    }
}

fn nth_of<'a>(cycle: &'a PlanCycle, exercise_id: &str, n: u32) -> Option<&'a PlanExercise> {
    cycle
        .sessions
        .iter()
        .flat_map(|session| &session.exercises)
        .filter(|exercise| exercise.exercise_id == exercise_id)
        .nth(usize::try_from(n).unwrap_or(usize::MAX))
}

/// A cycle's length: its override if the user changed it, the mesocycle's default otherwise.
fn length_of(mesocycle: &MesocycleSpec, cycle: u32) -> u32 {
    let length = mesocycle
        .length_overrides
        .iter()
        .rev()
        .find(|it| it.cycle_number == cycle)
        .map_or(mesocycle.default_length_days, |it| it.length_days);
    clamp_length(length)
}
