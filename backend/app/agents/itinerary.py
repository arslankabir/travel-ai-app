from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.factory import ModelFactory
from app.agents.state import GraphState

ITINERARY_SYSTEM = """You are a travel itinerary planner.
Create a day-by-day plan using the candidate stays provided.
Include estimated nightly costs and a rough total. Mention one swap-out option per stay.
Format as markdown with Day 1, Day 2, etc."""


async def itinerary_agent(state: GraphState) -> dict:
    listings = state.get("listings") or []
    if not listings:
        return {"itinerary": "No listings available to plan an itinerary."}

    stays = "\n".join(
        f"- ID {h['id']}: {h['name'] or 'Stay'} in {h['city']}, €{h['price']:.0f}/night"
        for h in listings[:5]
    )

    llm = ModelFactory.get_llm("itinerary", temperature=0.3)
    prompt = [
        SystemMessage(content=ITINERARY_SYSTEM),
        HumanMessage(content=f"Request: {state['user_input']}\n\nCandidate stays:\n{stays}"),
    ]
    result = await llm.ainvoke(prompt)
    content = result.content if isinstance(result.content, str) else str(result.content)

    return {
        "itinerary": content,
        "response_text": state.get("response_text", "") + f"\n\n**Itinerary:**\n{content}",
    }
