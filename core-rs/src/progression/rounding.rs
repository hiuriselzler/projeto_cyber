//! INV-02 — every prescribed load is liftable, in the unit the equipment is made in.
//!
//! This is the single helper that rounds a load. No other code in the project may round one: the
//! whole point is that the phone and the server land on the same barbell, and that error never
//! accumulates across a block, because every load is re-anchored to an exact multiple of the
//! increment rather than nudged from the last one.

/// Which way a load that falls between two steps is moved.
///
/// The tie rule belongs to the enum, not to the caller: **a load exactly halfway between two steps
/// takes the lighter one** ([ADR-010 § Amendment](../../../docs/decisions/ADR-010.md)). Erring
/// light is recoverable — the lifter does the set and the next cycle steps up. Erring heavy is a
/// missed rep at best.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RoundingMode {
    /// The closer of the two steps; a tie goes to the lighter load.
    Nearest,
    /// Never heavier than the load asked for.
    Down,
    /// Never lighter than the load asked for.
    Up,
}

impl RoundingMode {
    /// The name this mode carries in the shared fixtures and across both bindings.
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "nearest" => Some(Self::Nearest),
            "down" => Some(Self::Down),
            "up" => Some(Self::Up),
            _ => None,
        }
    }

    /// The inverse of [`RoundingMode::from_name`].
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Nearest => "nearest",
            Self::Down => "down",
            Self::Up => "up",
        }
    }
}

/// Round `weight_kg` to a multiple of `increment_kg`.
///
/// Loads cross the core as `f64` kilograms ([ADR-012](../../../docs/decisions/ADR-012.md)), and the
/// result is `steps × increment_kg` — an exact multiple, computed from the increment rather than
/// carried forward from the previous load, which is what keeps a 52-cycle block on the plate grid
/// (INV-02).
///
/// The function is **total**: it raises nothing and panics on nothing, because it is called across
/// two FFI boundaries where an exception is far more expensive than a defined answer. An increment
/// that is not a usable step — zero, negative, or not finite — leaves the load untouched, as does a
/// load that is not finite.
///
/// *Spike scope:* whether an unusable increment should instead be unrepresentable in the type is a
/// question for [task 005](../../../docs/tasks/005-strength-progression-planner.md), which owns the
/// engine this serves. It is noted in task 017's findings rather than settled here.
#[must_use]
pub fn round_to_increment(weight_kg: f64, increment_kg: f64, mode: RoundingMode) -> f64 {
    if !weight_kg.is_finite() || !increment_kg.is_finite() || increment_kg <= 0.0 {
        return weight_kg;
    }

    let quotient = weight_kg / increment_kg;
    let lower_steps = quotient.floor();
    let remainder = quotient - lower_steps;

    let steps = if remainder == 0.0 {
        // Already on the grid. Every mode leaves it where it is — `up` in particular must not add a
        // step to a load that is already liftable.
        lower_steps
    } else {
        match mode {
            RoundingMode::Down => lower_steps,
            RoundingMode::Up => lower_steps + 1.0,
            // `>`, not `>=`: at exactly half a step the lighter load wins. Written out rather than
            // delegated to `f64::round`, which rounds half *away from zero* and would hand back the
            // heavier one.
            RoundingMode::Nearest => {
                if remainder > 0.5 {
                    lower_steps + 1.0
                } else {
                    lower_steps
                }
            }
        }
    };

    steps * increment_kg
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_spike_s_two_named_cases() {
        // Task 017's acceptance criterion, and the pair called through both bindings.
        assert_eq!(round_to_increment(41.6, 2.5, RoundingMode::Nearest), 42.5);
        assert_eq!(round_to_increment(41.25, 2.5, RoundingMode::Nearest), 40.0);
    }

    #[test]
    fn a_load_already_on_the_grid_never_moves() {
        for mode in [RoundingMode::Nearest, RoundingMode::Down, RoundingMode::Up] {
            assert_eq!(round_to_increment(40.0, 2.5, mode), 40.0, "{mode:?}");
        }
    }

    #[test]
    fn rounding_is_idempotent() {
        // INV-10 in miniature: the engine re-anchors a load it has already anchored on every
        // re-projection, and must land in the same place.
        for mode in [RoundingMode::Nearest, RoundingMode::Down, RoundingMode::Up] {
            let once = round_to_increment(41.6, 2.5, mode);
            assert_eq!(round_to_increment(once, 2.5, mode), once, "{mode:?}");
        }
    }

    #[test]
    fn an_unusable_increment_leaves_the_load_alone() {
        for increment in [0.0, -2.5, f64::NAN, f64::INFINITY] {
            assert_eq!(
                round_to_increment(41.6, increment, RoundingMode::Nearest),
                41.6
            );
        }
        assert!(round_to_increment(f64::NAN, 2.5, RoundingMode::Nearest).is_nan());
    }

    #[test]
    fn mode_names_round_trip() {
        for mode in [RoundingMode::Nearest, RoundingMode::Down, RoundingMode::Up] {
            assert_eq!(RoundingMode::from_name(mode.name()), Some(mode));
        }
        assert_eq!(RoundingMode::from_name("ceiling"), None);
    }
}
