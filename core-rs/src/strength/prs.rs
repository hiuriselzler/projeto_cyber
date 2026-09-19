//! Personal records — FR-2.15, under INV-04 and INV-08.
//!
//! Four kinds, matching the schema's `pr_kind_enum` (03 §4): heaviest weight, best e1RM, best reps
//! at a given weight, and best volume in one session. All four are *per exercise*; the caller runs
//! this once per exercise in the finished workout.
//!
//! **Nothing here is stored.** `personal_records` is a derived cache that the server keeps and the
//! device does not have at all (03 §4, §8) — the phone recomputes from its own `set_logs`. So this
//! function takes the previous bests as an argument and hands back what beat them; where those
//! bests came from is the caller's problem, and it is a different problem on each side.
//!
//! **Two exclusions, from two different invariants.** A set must count (INV-04) — a warm-up PR is
//! not a PR — *and* it must not belong to a deload microcycle (INV-08): a deload is prescribed to
//! be easy, and congratulating someone for it rewards the opposite of following the plan.

use super::{LoggedSet, e1rm, is_counted_set, load_kg, volume_kg};

/// Which record was broken. Matches the schema's `pr_kind_enum` (03 §4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PrKind {
    /// The heaviest load moved for any counted set.
    MaxWeight,
    /// The highest e1RM (INV-07). A set logged without RIR can never set one.
    BestE1rm,
    /// The most reps at one exact load.
    MaxRepsAtWeight,
    /// The greatest tonnage for this exercise within a single session.
    BestSessionVolume,
}

impl PrKind {
    /// The name this kind carries in the database, the shared fixtures and both bindings.
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "max_weight" => Some(Self::MaxWeight),
            "best_e1rm" => Some(Self::BestE1rm),
            "max_reps_at_weight" => Some(Self::MaxRepsAtWeight),
            "best_session_volume" => Some(Self::BestSessionVolume),
            _ => None,
        }
    }

    /// The inverse of [`PrKind::from_name`].
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::MaxWeight => "max_weight",
            Self::BestE1rm => "best_e1rm",
            Self::MaxRepsAtWeight => "max_reps_at_weight",
            Self::BestSessionVolume => "best_session_volume",
        }
    }
}

/// The most reps ever done at one exact load.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RepsAtWeight {
    pub weight_kg: f64,
    pub reps: u32,
}

/// What this exercise's records stood at *before* the session being judged.
///
/// Every field is `Option` because a first-ever session has no previous anything, and that case
/// must produce records rather than crash — the first workout is the one most worth celebrating.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PersonalBests {
    pub max_weight_kg: Option<f64>,
    pub best_e1rm_kg: Option<f64>,
    pub best_session_volume_kg: Option<f64>,
    /// Previous best reps per exact load. Loads absent from this list have no previous best.
    pub best_reps_at_weight: Vec<RepsAtWeight>,
}

/// One record broken in the session just finished.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PrAchievement {
    pub kind: PrKind,
    /// The new record: kilograms for a load or an e1RM or a tonnage, a rep count for reps.
    pub value: f64,
    /// The load this record was set at. `None` for a session total, which belongs to no one set.
    pub weight_kg: Option<f64>,
    pub reps: Option<u32>,
    pub rir: Option<u32>,
    /// Which set in the input produced it, by position. `None` for a session total.
    ///
    /// A position rather than a `set_logs.id`: the core carries plain data and no identity, and the
    /// caller already holds the list it passed in.
    pub set_index: Option<u32>,
}

/// Every record the session broke, in a fixed order: heaviest weight, best e1RM, reps at a weight
/// (lightest load first), then session volume.
///
/// The order is part of the contract — two devices showing a celebration must show the same one
/// first (INV-10).
///
/// **Ties are not records.** Every comparison is strict: equalling a best is not beating it, and a
/// re-run over the same session must therefore produce the same answer rather than a fresh
/// celebration each time it is called.
#[must_use]
pub fn detect_prs(previous: &PersonalBests, session: &[LoggedSet]) -> Vec<PrAchievement> {
    let eligible: Vec<(usize, &LoggedSet)> = session
        .iter()
        .enumerate()
        .filter(|(_, set)| is_counted_set(set) && !set.is_deload)
        .collect();

    let mut achievements = Vec::new();

    if let Some((position, value)) = best_by(&eligible, load_kg)
        && beats(value, previous.max_weight_kg)
    {
        achievements.push(achievement(PrKind::MaxWeight, value, eligible[position]));
    }

    if let Some((position, value)) = best_by(&eligible, e1rm)
        && beats(value, previous.best_e1rm_kg)
    {
        achievements.push(achievement(PrKind::BestE1rm, value, eligible[position]));
    }

    achievements.extend(reps_at_weight_records(previous, &eligible));

    // Only the eligible sets count toward the session total, so a deload cycle cannot quietly set a
    // volume record on the strength of being long.
    let eligible_sets: Vec<LoggedSet> = eligible.iter().map(|(_, set)| **set).collect();
    let volume = volume_kg(&eligible_sets);
    if volume > 0.0 && beats(volume, previous.best_session_volume_kg) {
        achievements.push(PrAchievement {
            kind: PrKind::BestSessionVolume,
            value: volume,
            weight_kg: None,
            reps: None,
            rir: None,
            set_index: None,
        });
    }

    achievements
}

/// Whether `candidate` beats a previous best that may not exist. Strict: a tie is not a record.
fn beats(candidate: f64, previous: Option<f64>) -> bool {
    previous.is_none_or(|best| candidate > best)
}

/// The highest value `measure` yields over the eligible sets, with its position in that list.
///
/// Ties keep the **first** set — the one performed earliest, which is the one that actually set the
/// record. Returning the last would make the celebration point at a different row on a re-run.
fn best_by(
    eligible: &[(usize, &LoggedSet)],
    measure: fn(&LoggedSet) -> Option<f64>,
) -> Option<(usize, f64)> {
    let mut best: Option<(usize, f64)> = None;
    for (position, (_, set)) in eligible.iter().enumerate() {
        if let Some(value) = measure(set)
            && best.is_none_or(|(_, current)| value > current)
        {
            best = Some((position, value));
        }
    }
    best
}

/// Build an achievement from an eligible entry, restoring the set's index in the caller's own list.
fn achievement(kind: PrKind, value: f64, (index, set): (usize, &LoggedSet)) -> PrAchievement {
    PrAchievement {
        kind,
        value,
        weight_kg: load_kg(set),
        reps: set.reps,
        rir: set.rir,
        set_index: u32::try_from(index).ok(),
    }
}

/// Best reps at each distinct load in the session that beats whatever stood at that same load.
///
/// Loads are compared exactly. Two sets are "at the same weight" only if they are the same number
/// of kilograms, which is what INV-02 makes reasonable: every prescribed load is an exact multiple
/// of an increment, so the loads a user actually lifts land on a grid rather than drifting.
fn reps_at_weight_records(
    previous: &PersonalBests,
    eligible: &[(usize, &LoggedSet)],
) -> Vec<PrAchievement> {
    // (load, best reps this session, the eligible position that did it). A Vec rather than a map:
    // f64 is not a map key, the list is a handful of entries, and insertion order is deterministic
    // where a hash map's iteration order is not (INV-10, and `clippy.toml` bans HashMap for it).
    let mut best_this_session: Vec<(f64, u32, usize)> = Vec::new();

    for (position, (_, set)) in eligible.iter().enumerate() {
        let (Some(load), Some(reps)) = (load_kg(set), set.reps) else {
            continue;
        };
        match best_this_session
            .iter_mut()
            .find(|(seen, _, _)| *seen == load)
        {
            Some(entry) if reps > entry.1 => {
                entry.1 = reps;
                entry.2 = position;
            }
            Some(_) => {}
            None => best_this_session.push((load, reps, position)),
        }
    }

    best_this_session.sort_by(|left, right| {
        left.0
            .partial_cmp(&right.0)
            .unwrap_or(core::cmp::Ordering::Equal)
    });

    best_this_session
        .into_iter()
        .filter(|(load, reps, _)| {
            let standing = previous
                .best_reps_at_weight
                .iter()
                .find(|best| best.weight_kg == *load)
                .map(|best| best.reps);
            standing.is_none_or(|best| *reps > best)
        })
        .map(|(load, reps, position)| {
            let (index, set) = eligible[position];
            PrAchievement {
                kind: PrKind::MaxRepsAtWeight,
                value: f64::from(reps),
                weight_kg: Some(load),
                reps: Some(reps),
                rir: set.rir,
                set_index: u32::try_from(index).ok(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::strength::SetType;

    fn kinds(achievements: &[PrAchievement]) -> Vec<PrKind> {
        achievements.iter().map(|pr| pr.kind).collect()
    }

    #[test]
    fn a_first_ever_session_sets_every_record_it_can() {
        let session = [LoggedSet::working(100.0, 5, Some(2))];
        let prs = detect_prs(&PersonalBests::default(), &session);
        assert_eq!(
            kinds(&prs),
            vec![
                PrKind::MaxWeight,
                PrKind::BestE1rm,
                PrKind::MaxRepsAtWeight,
                PrKind::BestSessionVolume,
            ]
        );
    }

    #[test]
    fn a_deload_set_never_celebrates() {
        // INV-08. The set is stored and charted; it simply cannot be a record.
        let session = [LoggedSet {
            is_deload: true,
            ..LoggedSet::working(200.0, 10, Some(0))
        }];
        assert!(detect_prs(&PersonalBests::default(), &session).is_empty());
    }

    #[test]
    fn a_warm_up_never_celebrates_either() {
        // INV-04, and the reason PR detection asks `is_counted_set` rather than looking at weight.
        let session = [LoggedSet {
            set_type: SetType::Warmup,
            ..LoggedSet::working(200.0, 10, Some(0))
        }];
        assert!(detect_prs(&PersonalBests::default(), &session).is_empty());
    }

    #[test]
    fn equalling_a_best_is_not_beating_it() {
        let previous = PersonalBests {
            max_weight_kg: Some(100.0),
            best_e1rm_kg: Some(100.0 * (1.0 + 7.0 / 30.0)),
            best_session_volume_kg: Some(500.0),
            best_reps_at_weight: vec![RepsAtWeight {
                weight_kg: 100.0,
                reps: 5,
            }],
        };
        let session = [LoggedSet::working(100.0, 5, Some(2))];
        assert!(detect_prs(&previous, &session).is_empty());
    }

    #[test]
    fn detection_is_idempotent_against_the_records_it_just_set() {
        // INV-10 in the shape that matters here: finishing a workout twice — a retry, a re-sync —
        // must not celebrate twice.
        let session = [LoggedSet::working(100.0, 5, Some(2))];
        let first = detect_prs(&PersonalBests::default(), &session);
        assert!(!first.is_empty());

        let updated = PersonalBests {
            max_weight_kg: Some(100.0),
            best_e1rm_kg: e1rm(&session[0]),
            best_session_volume_kg: Some(500.0),
            best_reps_at_weight: vec![RepsAtWeight {
                weight_kg: 100.0,
                reps: 5,
            }],
        };
        assert!(detect_prs(&updated, &session).is_empty());
    }

    #[test]
    fn a_set_without_rir_can_take_a_weight_record_but_not_an_e1rm_one() {
        // INV-07's accepted consequence, and the one place skipping the chip visibly costs the user
        // something.
        let previous = PersonalBests {
            max_weight_kg: Some(100.0),
            best_e1rm_kg: Some(50.0),
            ..PersonalBests::default()
        };
        let session = [LoggedSet::working(120.0, 3, None)];
        let prs = detect_prs(&previous, &session);
        assert!(kinds(&prs).contains(&PrKind::MaxWeight));
        assert!(!kinds(&prs).contains(&PrKind::BestE1rm));
    }

    #[test]
    fn reps_at_weight_is_per_load_and_ordered_lightest_first() {
        let previous = PersonalBests {
            max_weight_kg: Some(1000.0),
            best_e1rm_kg: Some(1000.0),
            best_session_volume_kg: Some(1_000_000.0),
            best_reps_at_weight: vec![RepsAtWeight {
                weight_kg: 100.0,
                reps: 8,
            }],
        };
        let session = [
            LoggedSet::working(100.0, 6, Some(2)),
            LoggedSet::working(80.0, 10, Some(1)),
        ];
        let prs = detect_prs(&previous, &session);
        // 6 reps at 100 kg loses to the standing 8; 10 at 80 kg has nothing to beat.
        assert_eq!(kinds(&prs), vec![PrKind::MaxRepsAtWeight]);
        assert_eq!(prs[0].weight_kg, Some(80.0));
        assert_eq!(prs[0].reps, Some(10));
    }

    #[test]
    fn the_best_set_at_a_load_is_the_one_reported() {
        let session = [
            LoggedSet::working(100.0, 3, Some(4)),
            LoggedSet::working(100.0, 7, Some(1)),
            LoggedSet::working(100.0, 5, Some(2)),
        ];
        let prs = detect_prs(&PersonalBests::default(), &session);
        let reps_pr = prs
            .iter()
            .find(|pr| pr.kind == PrKind::MaxRepsAtWeight)
            .expect("a first session sets one");
        assert_eq!(reps_pr.reps, Some(7));
    }

    #[test]
    fn a_bodyweight_record_is_measured_on_total_load() {
        // FR-2.15a: weight PRs use body weight plus added load, so adding 5 kg to yesterday's
        // pull-up is a record and losing 5 kg of body weight is not.
        let previous = PersonalBests {
            max_weight_kg: Some(95.0),
            ..PersonalBests::default()
        };
        let session = [LoggedSet {
            uses_bodyweight: true,
            body_weight_kg: Some(80.0),
            ..LoggedSet::working(20.0, 5, Some(2))
        }];
        let prs = detect_prs(&previous, &session);
        let weight_pr = prs
            .iter()
            .find(|pr| pr.kind == PrKind::MaxWeight)
            .expect("100 kg beats 95 kg");
        assert_eq!(weight_pr.value, 100.0);
    }

    #[test]
    fn session_volume_counts_only_the_eligible_sets() {
        let session = [
            LoggedSet {
                set_type: SetType::Warmup,
                ..LoggedSet::working(200.0, 10, None)
            },
            LoggedSet::working(100.0, 5, Some(2)),
        ];
        let prs = detect_prs(&PersonalBests::default(), &session);
        let volume_pr = prs
            .iter()
            .find(|pr| pr.kind == PrKind::BestSessionVolume)
            .expect("the working set makes one");
        assert_eq!(volume_pr.value, 500.0);
        assert_eq!(volume_pr.set_index, None);
    }

    #[test]
    fn an_empty_session_breaks_nothing() {
        assert!(detect_prs(&PersonalBests::default(), &[]).is_empty());
    }

    #[test]
    fn kind_names_round_trip() {
        for kind in [
            PrKind::MaxWeight,
            PrKind::BestE1rm,
            PrKind::MaxRepsAtWeight,
            PrKind::BestSessionVolume,
        ] {
            assert_eq!(PrKind::from_name(kind.name()), Some(kind));
        }
        assert_eq!(PrKind::from_name("best_streak"), None);
    }
}
