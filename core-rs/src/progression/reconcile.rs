//! 01 §3.4 — reconciliation: re-project the plan from what actually happened (task 005 stage 3a).
//!
//! **The model.** Every exercise progresses from its latest *anchor*, and a projected cycle is the anchor
//! plus the working steps since it, rounded once ([`project`]). The anchors, walking the block in order:
//! - an exercise's **first appearance** — cycle 1 for everything cycle 1 holds;
//! - a **logged session**, adjusted by its outcome (stage 3, decisions 3 and 4);
//! - a **locked cycle**, and a projected cycle holding a **user-edited or pinned set** (FR-3.14,
//!   decision 5) — each assumed `Met`.
//!
//! With no logs and no edits, cycle 1 is the only anchor and the result is exactly the block `generate`
//! wrote, so reconciling a fresh plan changes nothing. A deload is never an anchor: it multiplies the
//! last working prescription, as it does at generation, and the cycle after it resumes past it (FR-3.9).
//!
//! **The guard** (INV-06, decision 6). A plan holding any cycle projected by a newer engine is returned
//! exactly as given — the older engine yields. Otherwise only `projected` cycles with nothing logged in
//! them are rewritten, each stamped with [`ENGINE_VERSION`] and `last_write_kind = 'engine'`, and a user's
//! rows inside them are kept exactly. Everything else comes back as it went in.
//!
//! **Pure** (INV-10): `today` is a parameter, used only to tell a missed session from a future one.

use std::collections::{BTreeMap, BTreeSet};

use super::ENGINE_VERSION;
use super::classify::classify;
use super::dates::EpochDay;
use super::deload::deload_sets;
use super::plan::{
    CycleOneSet, CycleStatus, FailurePolicy, MesocycleSpec, Outcome, PlanCycle, PlanExercise,
    PlanLog, PlanSet, PlannedSet, Reconciled, SetOrigin, SlotOutcome, Strategy, WriteKind,
};
use super::strategies::{Prescriber, Progress, project};
use crate::strength::{e1rm, is_counted_set};

/// Re-project `plan` from `logs`, as of `today`.
///
/// `mesocycle` supplies the deload multipliers; the cycles, their lengths, dates and deload flags are
/// the plan's own. The output is canonical — cycles by number, sessions by `(day_index, order_index)`,
/// exercises by `order_index`, sets by `set_index` — and running it again on its own output with the
/// same logs returns the same thing (INV-10).
#[must_use]
pub fn reconcile(
    mesocycle: &MesocycleSpec,
    plan: &[PlanCycle],
    logs: &[PlanLog],
    today: EpochDay,
) -> Reconciled {
    if plan
        .iter()
        .any(|cycle| cycle.engine_version > ENGINE_VERSION)
    {
        return Reconciled {
            cycles: plan.to_vec(),
            outcomes: Vec::new(),
        };
    }

    let mut cycles: Vec<PlanCycle> = plan.iter().cloned().map(canonical).collect();
    cycles.sort_by_key(|cycle| cycle.cycle_number);
    let working_cycles =
        u32::try_from(cycles.iter().filter(|it| !it.is_deload).count()).unwrap_or(u32::MAX);
    let first_cycle = cycles.first().map(|cycle| cycle.cycle_number);
    let logged = Logged::index(logs);

    let mut slots: BTreeMap<(String, u32), Slot> = BTreeMap::new();
    let mut outcomes = Vec::new();
    for cycle in &mut cycles {
        let rewritable = Some(cycle.cycle_number) != first_cycle
            && cycle.status == CycleStatus::Projected
            // Belt and braces: a cycle holding a logged set has started, whatever its status says.
            && !logged.cycles.contains(&cycle.cycle_number);
        walk_cycle(
            cycle,
            rewritable,
            working_cycles,
            mesocycle,
            &logged,
            today,
            &mut slots,
            &mut outcomes,
        );
        if rewritable {
            cycle.engine_version = ENGINE_VERSION;
            cycle.last_write_kind = WriteKind::Engine;
        }
    }
    Reconciled { cycles, outcomes }
}

/// The logs, indexed the ways the walk asks for them.
struct Logged {
    by_exercise: BTreeMap<(u32, u32, u32, u32), Vec<PlanLog>>,
    sessions: BTreeSet<(u32, u32, u32)>,
    cycles: BTreeSet<u32>,
}

impl Logged {
    fn index(logs: &[PlanLog]) -> Self {
        let mut by_exercise: BTreeMap<(u32, u32, u32, u32), Vec<PlanLog>> = BTreeMap::new();
        let mut sessions = BTreeSet::new();
        let mut cycles = BTreeSet::new();
        for log in logs {
            by_exercise
                .entry((
                    log.cycle_number,
                    log.day_index,
                    log.session_order_index,
                    log.exercise_order_index,
                ))
                .or_default()
                .push(*log);
            sessions.insert((log.cycle_number, log.day_index, log.session_order_index));
            cycles.insert(log.cycle_number);
        }
        Self {
            by_exercise,
            sessions,
            cycles,
        }
    }
}

/// One exercise's progression through the block: its anchor, and where the walk stands relative to it.
struct Slot {
    anchor: Vec<CycleOneSet>,
    /// The latest e1RM `percent_1rm` read from a log; `None` until one is, and the rule's baseline stands.
    e1rm_kg: Option<f64>,
    /// The anchor's own position (see [`Progress::position`]).
    position: u32,
    /// Steps the first working cycle after the anchor takes: 1 after `Met`, 2 after `Exceeded`, 0 after a
    /// failure policy.
    first_step: u32,
    /// Whether that first cycle moves on a position (1) or repeats the anchor's (0, after a hold).
    advance: u32,
    /// Working cycles since the anchor in which this exercise appears.
    since: u32,
    /// The last working cycle's prescription as it stands — what a deload multiplies.
    last_working: Vec<PlannedSet>,
}

impl Slot {
    fn at(rows: &[PlanSet], position: u32) -> Self {
        Self {
            anchor: anchor_of(rows),
            e1rm_kg: None,
            position,
            first_step: 1,
            advance: 1,
            since: 0,
            last_working: planned_of(rows),
        }
    }

    fn progress(&self, working_cycles: u32) -> Progress {
        let later = self.since.saturating_sub(1);
        Progress {
            steps: self.first_step + later,
            position: self.position + self.advance + later,
            working_cycles,
        }
    }

    fn re_anchor(
        &mut self,
        anchor: Vec<CycleOneSet>,
        position: u32,
        first_step: u32,
        advance: u32,
    ) {
        self.anchor = anchor;
        self.position = position;
        self.first_step = first_step;
        self.advance = advance;
        self.since = 0;
    }
}

#[expect(
    clippy::too_many_arguments,
    reason = "one cycle's step of a walk whose state lives in the caller; bundling it would only rename the arguments"
)]
fn walk_cycle(
    cycle: &mut PlanCycle,
    rewritable: bool,
    working_cycles: u32,
    mesocycle: &MesocycleSpec,
    logged: &Logged,
    today: EpochDay,
    slots: &mut BTreeMap<(String, u32), Slot>,
    outcomes: &mut Vec<SlotOutcome>,
) {
    let cycle_number = cycle.cycle_number;
    let (starts_on, is_deload, status) = (cycle.starts_on, cycle.is_deload, cycle.status);

    // Each exercise's slot and outcome first: `repeat_cycle` on one failed exercise holds them all.
    let mut seen: BTreeMap<String, u32> = BTreeMap::new();
    let mut entries = Vec::new();
    for (session_at, session) in cycle.sessions.iter().enumerate() {
        let session_key = (cycle_number, session.day_index, session.order_index);
        let session_logged = logged.sessions.contains(&session_key);
        let day = starts_on.saturating_add(session.day_index.cast_signed().saturating_sub(1));
        for (exercise_at, exercise) in session.exercises.iter().enumerate() {
            let occurrence = seen.entry(exercise.exercise_id.clone()).or_insert(0);
            let key = (exercise.exercise_id.clone(), *occurrence);
            *occurrence += 1;
            let exercise_logs: &[PlanLog] = logged
                .by_exercise
                .get(&(
                    cycle_number,
                    session.day_index,
                    session.order_index,
                    exercise.order_index,
                ))
                .map_or(&[], Vec::as_slice);
            let outcome = if session_logged {
                // In a logged session, an exercise with nothing logged fell short (decision 3).
                match classify(&exercise.sets, exercise_logs) {
                    Outcome::Missed => Some(Outcome::Under),
                    judged => Some(judged),
                }
            } else if status != CycleStatus::Skipped && day < today {
                Some(Outcome::Missed)
            } else {
                None
            };
            entries.push((session_at, exercise_at, key, outcome, exercise_logs));
        }
    }
    let repeat_cycle = !is_deload
        && entries
            .iter()
            .any(|(session_at, exercise_at, _, outcome, _)| {
                *outcome == Some(Outcome::Under)
                    && cycle.sessions[*session_at].exercises[*exercise_at]
                        .rule
                        .failure_policy
                        == FailurePolicy::RepeatCycle
            });

    for (session_at, exercise_at, key, outcome, exercise_logs) in entries {
        let exercise = &mut cycle.sessions[session_at].exercises[exercise_at];
        let mut open_loop = false;

        match slots.get_mut(&key) {
            None => {
                // First appearance: its own rows are its anchor, and are never rewritten. A deload
                // straight after it multiplies those rows *as the engine reads them* — on the grid, inside
                // the rule, a double progression's range attached — exactly as `generate` does, or a
                // fresh plan would not reconcile to itself.
                let mut slot = Slot::at(&exercise.sets, 0);
                slot.last_working = project(
                    Prescriber::of_plan(exercise),
                    &slot.anchor,
                    None,
                    Progress {
                        steps: 0,
                        position: 0,
                        working_cycles,
                    },
                );
                if !is_deload {
                    open_loop = settle(
                        &mut slot,
                        exercise,
                        status,
                        outcome,
                        repeat_cycle,
                        exercise_logs,
                        0,
                    );
                }
                slots.insert(key.clone(), slot);
            }
            Some(slot) if is_deload => {
                if rewritable {
                    let prescriber = Prescriber::of_plan(exercise);
                    let deloaded = deload_sets(prescriber, slot.last_working.clone(), mesocycle);
                    exercise.sets = merged(deloaded, &exercise.sets);
                }
            }
            Some(slot) => {
                slot.since += 1;
                let at = slot.progress(working_cycles);
                if rewritable {
                    let prescriber = Prescriber::of_plan(exercise);
                    let projected = project(prescriber, &slot.anchor, slot.e1rm_kg, at);
                    let users = exercise.sets.iter().any(PlanSet::is_users);
                    exercise.sets = merged(projected, &exercise.sets);
                    if users {
                        slot.re_anchor(anchor_of(&exercise.sets), at.position, 1, 1);
                    }
                } else {
                    open_loop = settle(
                        slot,
                        exercise,
                        status,
                        outcome,
                        repeat_cycle,
                        exercise_logs,
                        at.position,
                    );
                }
                slot.last_working = planned_of(&exercise.sets);
            }
        }

        if let Some(outcome) = outcome {
            outcomes.push(SlotOutcome {
                cycle_number,
                exercise_id: key.0,
                occurrence: key.1,
                outcome,
                open_loop,
            });
        }
    }
}

/// A working cycle the engine may not rewrite: its rows stand, and may re-anchor the exercise — on a
/// logged outcome (decision 4), or because the cycle is locked (decision 5). Returns whether
/// `percent_1rm` ran open-loop.
fn settle(
    slot: &mut Slot,
    exercise: &PlanExercise,
    status: CycleStatus,
    outcome: Option<Outcome>,
    repeat_cycle: bool,
    logs: &[PlanLog],
    position: u32,
) -> bool {
    let percent = match &exercise.rule.strategy {
        Strategy::Percent1rm {
            baseline_e1rm_kg, ..
        } => Some(*baseline_e1rm_kg),
        _ => None,
    };
    match outcome {
        Some(Outcome::Under) | Some(Outcome::Met | Outcome::Exceeded) if repeat_cycle => {
            slot.re_anchor(anchor_of(&exercise.sets), position, 0, 0);
            false
        }
        Some(Outcome::Under) => {
            let mut anchor = anchor_of(&exercise.sets);
            if let FailurePolicy::ReduceLoad { load_bp } = exercise.rule.failure_policy {
                let share = f64::from(load_bp) / f64::from(super::BASIS_POINTS);
                for set in &mut anchor {
                    set.target_weight_kg = set.target_weight_kg.map(|kg| kg * share);
                }
                if let Some(baseline) = percent {
                    slot.e1rm_kg = Some(slot.e1rm_kg.unwrap_or(baseline) * share);
                }
            }
            slot.re_anchor(anchor, position, 0, 0);
            false
        }
        Some(met @ (Outcome::Met | Outcome::Exceeded)) => {
            let double = matches!(exercise.rule.strategy, Strategy::DoubleProgression { .. });
            let anchor = achieved(&exercise.sets, logs, double);
            let first_step = if met == Outcome::Exceeded && percent.is_none() {
                2
            } else {
                1
            };
            let mut open_loop = false;
            if percent.is_some() {
                match best_e1rm(logs) {
                    Some(best) => slot.e1rm_kg = Some(best),
                    None => open_loop = true,
                }
            }
            slot.re_anchor(anchor, position, first_step, 1);
            open_loop
        }
        Some(Outcome::Missed) | None => {
            if status == CycleStatus::Locked {
                slot.re_anchor(anchor_of(&exercise.sets), position, 1, 1);
            }
            false
        }
    }
}

/// The rows as a performance to step from (decision 4): each set's load as logged, where it was; the
/// reps as logged too for double progression, which progresses reps — the prescription's otherwise.
fn achieved(rows: &[PlanSet], logs: &[PlanLog], double: bool) -> Vec<CycleOneSet> {
    rows.iter()
        .map(|row| {
            let done = logs
                .iter()
                .find(|log| log.set_index == row.set_index && log.set.is_completed)
                .map(|log| log.set);
            CycleOneSet {
                set_index: row.set_index,
                set_type: row.set_type,
                target_weight_kg: done.and_then(|it| it.weight_kg).or(row.target_weight_kg),
                target_reps: if double {
                    done.and_then(|it| it.reps).or(row.target_reps)
                } else {
                    row.target_reps
                },
                target_rir: row.target_rir,
            }
        })
        .collect()
}

/// The best e1RM among the session's counted sets (INV-07), or `None` — never an estimate.
fn best_e1rm(logs: &[PlanLog]) -> Option<f64> {
    logs.iter()
        .filter(|log| is_counted_set(&log.set))
        .filter_map(|log| e1rm(&log.set))
        .fold(None, |best: Option<f64>, it| {
            Some(best.map_or(it, |best| best.max(it)))
        })
}

/// The engine's rows, with every row the user owns kept exactly as it was (FR-3.14).
fn merged(engine: Vec<PlannedSet>, existing: &[PlanSet]) -> Vec<PlanSet> {
    let mut rows: BTreeMap<u32, PlanSet> = engine
        .into_iter()
        .map(|set| (set.set_index, generated(set)))
        .collect();
    for users in existing.iter().filter(|it| it.is_users()) {
        rows.insert(users.set_index, *users);
    }
    rows.into_values().collect()
}

const fn generated(set: PlannedSet) -> PlanSet {
    PlanSet {
        set_index: set.set_index,
        set_type: set.set_type,
        target_weight_kg: set.target_weight_kg,
        target_reps: set.target_reps,
        target_min_reps: set.target_min_reps,
        target_max_reps: set.target_max_reps,
        target_rir: set.target_rir,
        was_clamped: set.was_clamped,
        origin: SetOrigin::Generated,
        is_pinned: false,
    }
}

fn anchor_of(rows: &[PlanSet]) -> Vec<CycleOneSet> {
    rows.iter()
        .map(|row| CycleOneSet {
            set_index: row.set_index,
            set_type: row.set_type,
            target_weight_kg: row.target_weight_kg,
            target_reps: row.target_reps,
            target_rir: row.target_rir,
        })
        .collect()
}

fn planned_of(rows: &[PlanSet]) -> Vec<PlannedSet> {
    rows.iter()
        .map(|row| PlannedSet {
            set_index: row.set_index,
            set_type: row.set_type,
            target_weight_kg: row.target_weight_kg,
            target_reps: row.target_reps,
            target_min_reps: row.target_min_reps,
            target_max_reps: row.target_max_reps,
            target_rir: row.target_rir,
            was_clamped: row.was_clamped,
        })
        .collect()
}

/// A cycle's rows in canonical order.
fn canonical(mut cycle: PlanCycle) -> PlanCycle {
    cycle
        .sessions
        .sort_by_key(|session| (session.day_index, session.order_index));
    for session in &mut cycle.sessions {
        session
            .exercises
            .sort_by_key(|exercise| exercise.order_index);
        for exercise in &mut session.exercises {
            exercise.sets.sort_by_key(|set| set.set_index);
        }
    }
    cycle
}
