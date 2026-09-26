//! INV-06's statuses, moved by what was logged — task 005 stage 4a, decision 2.
//!
//! A microcycle's status decides what the engine may rewrite, so the phone and the server must move it
//! identically: this is the one rule, and both wrappers call it before `reconcile`. The entry point to
//! re-projection is *settle, then reconcile, then write*.

use std::collections::BTreeSet;

use super::dates::EpochDay;
use super::plan::{CycleStatus, PlanCycle, PlanLog, WriteKind};

/// Move each cycle's status on from the logs, as of `today`:
/// - `projected` → `in_progress` at the first set logged against the cycle;
/// - `in_progress` → `completed` when every one of its sessions holds a logged set, or its last day
///   (`starts_on + length_days − 1`) is before `today`;
/// - `locked` and `skipped` are the user's and are never moved; nothing ever moves backwards.
///
/// A cycle whose status moves is written as the user's (`last_write_kind = 'user'`): the move is made by
/// their training, and 03 §5's trigger refuses an engine write to a cycle that is no longer projected.
/// Nothing else in any cycle changes. The output is in the order given.
#[must_use]
pub fn settle_statuses(plan: &[PlanCycle], logs: &[PlanLog], today: EpochDay) -> Vec<PlanCycle> {
    let sessions: BTreeSet<(u32, u32, u32)> = logs
        .iter()
        .map(|log| (log.cycle_number, log.day_index, log.session_order_index))
        .collect();
    let cycles: BTreeSet<u32> = logs.iter().map(|log| log.cycle_number).collect();

    plan.iter()
        .cloned()
        .map(|mut cycle| {
            let before = cycle.status;
            if cycle.status == CycleStatus::Projected && cycles.contains(&cycle.cycle_number) {
                cycle.status = CycleStatus::InProgress;
            }
            if cycle.status == CycleStatus::InProgress {
                let every_session_logged = cycle.sessions.iter().all(|session| {
                    sessions.contains(&(cycle.cycle_number, session.day_index, session.order_index))
                });
                let last_day = cycle
                    .starts_on
                    .saturating_add(cycle.length_days.cast_signed())
                    .saturating_sub(1);
                if every_session_logged || last_day < today {
                    cycle.status = CycleStatus::Completed;
                }
            }
            if cycle.status != before {
                cycle.last_write_kind = WriteKind::User;
            }
            cycle
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progression::plan::PlanSession;
    use crate::strength::LoggedSet;

    fn cycle(number: u32, status: CycleStatus, days: &[u32]) -> PlanCycle {
        PlanCycle {
            cycle_number: number,
            length_days: 7,
            starts_on: i32::try_from(number - 1).unwrap() * 7,
            is_deload: false,
            status,
            engine_version: 1,
            last_write_kind: WriteKind::Engine,
            sessions: days
                .iter()
                .map(|&day_index| PlanSession {
                    day_index,
                    order_index: 0,
                    exercises: Vec::new(),
                })
                .collect(),
        }
    }

    fn log(cycle_number: u32, day_index: u32) -> PlanLog {
        PlanLog {
            cycle_number,
            day_index,
            session_order_index: 0,
            exercise_order_index: 0,
            set_index: 0,
            set: LoggedSet::working(40.0, 6, Some(3)),
        }
    }

    fn statuses(plan: &[PlanCycle]) -> Vec<CycleStatus> {
        plan.iter().map(|it| it.status).collect()
    }

    #[test]
    fn the_first_log_starts_a_cycle_and_the_last_session_completes_it() {
        let plan = [cycle(1, CycleStatus::Projected, &[1, 4])];
        let started = settle_statuses(&plan, &[log(1, 1)], 2);
        assert_eq!(statuses(&started), vec![CycleStatus::InProgress]);
        assert_eq!(started[0].last_write_kind, WriteKind::User);
        let finished = settle_statuses(&started, &[log(1, 1), log(1, 4)], 5);
        assert_eq!(statuses(&finished), vec![CycleStatus::Completed]);
    }

    #[test]
    fn a_cycle_under_way_completes_once_its_last_day_has_passed() {
        let plan = [cycle(1, CycleStatus::InProgress, &[1, 4])];
        // Day 6 is the cycle's last (0..=6): still in progress on it, completed the day after.
        assert_eq!(
            statuses(&settle_statuses(&plan, &[log(1, 1)], 6)),
            vec![CycleStatus::InProgress]
        );
        assert_eq!(
            statuses(&settle_statuses(&plan, &[log(1, 1)], 7)),
            vec![CycleStatus::Completed]
        );
    }

    #[test]
    fn the_users_statuses_never_move_and_nothing_moves_backwards() {
        let plan = [
            cycle(1, CycleStatus::Completed, &[1]),
            cycle(2, CycleStatus::Locked, &[1]),
            cycle(3, CycleStatus::Skipped, &[1]),
            cycle(4, CycleStatus::Projected, &[1]),
        ];
        let settled = settle_statuses(&plan, &[log(2, 1), log(3, 1)], 100);
        // A projected cycle nobody trained is not "completed" by the calendar: it was missed, and stays the
        // engine's to rewrite.
        assert_eq!(settled, plan.to_vec());
    }
}
