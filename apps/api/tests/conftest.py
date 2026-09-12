import asyncio
import sys

# psycopg's async mode cannot run on the ProactorEventLoop that Windows uses by default. CI and
# production run on Linux; this keeps the integration tests runnable on a Windows development
# machine.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
