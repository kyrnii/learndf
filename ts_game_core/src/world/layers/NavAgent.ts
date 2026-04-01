export type NavAgentSize = "small" | "medium" | "large";

export const NAV_AGENT_CLEARANCE_CELLS: Record<NavAgentSize, number> = {
    small: 0,
    medium: 1,
    large: 2,
};

export function getNavAgentClearanceCells(agentSize: NavAgentSize = "small"): number {
    return NAV_AGENT_CLEARANCE_CELLS[agentSize] ?? 0;
}
