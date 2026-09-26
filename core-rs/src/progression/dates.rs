//! INV-25 — the microcycle is the training unit, and its dates are a walk, not a weekday.
//!
//! A date crosses the core as an [`EpochDay`]: whole days since 1970-01-01. `deny.toml` bans the date
//! crates along with the clock (INV-10), and nothing here needs a calendar — a cycle starts a number of
//! days after the one before it, and a session falls a number of days into its cycle. Each wrapper
//! converts to and from its own `date` type (task 005, stage 1, decision 6).

/// Whole days since 1970-01-01. Negative before it; never a timestamp, never a time zone.
pub type EpochDay = i32;

/// The shortest microcycle a user may choose (FR-3.1a).
pub const MIN_LENGTH_DAYS: u32 = 1;
/// The longest microcycle a user may choose (FR-3.1a). There is no constant for 7: it is a default the
/// user is offered, never an assumption the engine makes (INV-25).
pub const MAX_LENGTH_DAYS: u32 = 28;

/// The day each cycle starts on, walking the block: cycle 1 starts on `start_day`, and each cycle after
/// it starts exactly `length_days` after the one before (03 §5 *Dates are derived*).
///
/// One start per length, in order. **Total:** a length outside 1–28 is clamped into it, so a walk never
/// stalls on a zero-day cycle, and the arithmetic saturates rather than overflowing.
#[must_use]
pub fn resolve_dates(start_day: EpochDay, length_days: &[u32]) -> Vec<EpochDay> {
    let mut starts = Vec::with_capacity(length_days.len());
    let mut next = start_day;
    for &length in length_days {
        starts.push(next);
        next = next.saturating_add(clamp_length(length).cast_signed());
    }
    starts
}

/// A cycle length inside FR-3.1a's bounds.
pub(super) const fn clamp_length(length_days: u32) -> u32 {
    if length_days < MIN_LENGTH_DAYS {
        MIN_LENGTH_DAYS
    } else if length_days > MAX_LENGTH_DAYS {
        MAX_LENGTH_DAYS
    } else {
        length_days
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_nine_day_block_s_third_cycle_starts_eighteen_days_in() {
        // Task 005's criterion: no weekday assumption anywhere (INV-25).
        assert_eq!(resolve_dates(100, &[9, 9, 9]), vec![100, 109, 118]);
    }

    #[test]
    fn one_short_cycle_shifts_every_later_start() {
        assert_eq!(resolve_dates(0, &[7, 7, 5, 7, 7]), vec![0, 7, 14, 19, 26]);
    }

    #[test]
    fn an_out_of_range_length_is_clamped_rather_than_stalling_the_walk() {
        assert_eq!(resolve_dates(0, &[0, 40, 1]), vec![0, 1, 29]);
    }

    #[test]
    fn the_walk_saturates_instead_of_overflowing() {
        assert_eq!(
            resolve_dates(EpochDay::MAX - 3, &[7, 7]),
            vec![EpochDay::MAX - 3, EpochDay::MAX]
        );
    }

    #[test]
    fn no_lengths_no_starts() {
        assert!(resolve_dates(0, &[]).is_empty());
    }
}
