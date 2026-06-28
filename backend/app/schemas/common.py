from typing import Annotated

from pydantic import PlainSerializer

# Airbnb listing/review IDs exceed JS Number.MAX_SAFE_INTEGER — serialize as strings in JSON.
BigIntId = Annotated[int, PlainSerializer(lambda v: str(v), return_type=str)]
