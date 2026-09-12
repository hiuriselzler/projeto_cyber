"""SQLAlchemy ORM tables — shapes only (03, task 002).

Importing this package registers every table on `Base.metadata`.
"""

from app.models import cardio, gamification, identity, strength
from app.models.base import Base

__all__ = ["Base", "cardio", "gamification", "identity", "strength"]
