# Breaks "Core knows no domain": one import per forbidden package, so a typo in any entry is caught.
import fixture_app.api.things
import fixture_app.domain.things
import fixture_app.models.things
import fixture_app.repositories.things
import fixture_app.services.things
