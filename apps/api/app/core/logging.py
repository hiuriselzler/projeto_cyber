"""Structured JSON logging (04 §9). Never log passwords, tokens, coordinates or email addresses."""

import logging
import sys
from typing import TextIO

import structlog

_TIMESTAMPER = structlog.processors.TimeStamper(fmt="iso", utc=True)


def configure_logging(level: str = "INFO", stream: TextIO | None = None) -> None:
    output = stream if stream is not None else sys.stdout
    numeric_level = logging.getLevelNamesMapping()[level]

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            _TIMESTAMPER,
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(numeric_level),
        logger_factory=structlog.PrintLoggerFactory(file=output),
        cache_logger_on_first_use=False,
    )

    # Libraries log through the standard library; render them as the same JSON.
    handler = logging.StreamHandler(output)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=[
                structlog.contextvars.merge_contextvars,
                structlog.stdlib.add_log_level,
                _TIMESTAMPER,
            ],
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.processors.format_exc_info,
                structlog.processors.JSONRenderer(),
            ],
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(numeric_level)

    for name in ("uvicorn", "uvicorn.error"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True
    # RequestContextMiddleware writes one line per request; uvicorn's access log would be a second.
    logging.getLogger("uvicorn.access").disabled = True
    # HTTP clients log every request URL at INFO, query string included — which is where a token or
    # an email address would be (04 §9).
    for name in ("httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)
