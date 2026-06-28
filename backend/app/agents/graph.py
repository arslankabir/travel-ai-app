from langgraph.graph import END, StateGraph

from app.agents.intent import intent_agent
from app.agents.itinerary import itinerary_agent
from app.agents.retrieval import retrieval_agent
from app.agents.review import review_agent
from app.agents.state import GraphState, IntentType


def route_after_intent(state: GraphState) -> str:
    if state.get("mode") == "search":
        return END
    intent: IntentType | None = state.get("intent_type")
    if intent == "search_only":
        return "retrieval_agent"
    if intent == "review_compare":
        return "retrieval_agent"
    if intent == "itinerary_plan":
        return "retrieval_agent"
    return "retrieval_agent"


def route_after_retrieval(state: GraphState) -> str:
    if state.get("mode") == "search":
        return END
    intent = state.get("intent_type")
    if intent == "search_only":
        return END
    if intent == "review_compare":
        return "review_agent"
    if intent == "itinerary_plan":
        return "review_agent"
    return END


def route_after_review(state: GraphState) -> str:
    if state.get("intent_type") == "itinerary_plan":
        return "itinerary_agent"
    return END


def build_graph():
    graph = StateGraph(GraphState)

    graph.add_node("intent_agent", intent_agent)
    graph.add_node("retrieval_agent", retrieval_agent)
    graph.add_node("review_agent", review_agent)
    graph.add_node("itinerary_agent", itinerary_agent)

    graph.set_entry_point("intent_agent")

    graph.add_conditional_edges("intent_agent", route_after_intent, {
        END: END,
        "retrieval_agent": "retrieval_agent",
    })
    graph.add_conditional_edges("retrieval_agent", route_after_retrieval, {
        END: END,
        "review_agent": "review_agent",
    })
    graph.add_conditional_edges("review_agent", route_after_review, {
        END: END,
        "itinerary_agent": "itinerary_agent",
    })
    graph.add_edge("itinerary_agent", END)

    return graph.compile()


app_graph = build_graph()
