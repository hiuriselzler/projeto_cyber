# Breaks "Only the domain reaches the core": ADR-004's PyO3 module is reached through
# fixture_app.domain and nowhere else, so every other package plants one import here.
import cyberathlete_core
