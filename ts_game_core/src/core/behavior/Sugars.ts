import { Entity } from "../Entity";
import { BehaviorNode } from "./Node";
import { ParallelNode, Sequence } from "./Composites";
import { ConditionNode, MultiConditionNode } from "./Leaves";

export function WhileNode(cond: (inst: Entity) => boolean, name: string, node: BehaviorNode): BehaviorNode {
    return new ParallelNode([
        new ConditionNode(cond, name),
        node
    ], `While(${name})`);
}

export function IfNode(cond: (inst: Entity) => boolean, name: string, node: BehaviorNode): BehaviorNode {
    const seq = new Sequence([
        new ConditionNode(cond, name),
        node
    ]);
    seq.name = `If(${name})`;
    return seq;
}

export function IfThenDoWhileNode(ifCond: (inst: Entity) => boolean, whileCond: (inst: Entity) => boolean, name: string, node: BehaviorNode): BehaviorNode {
    return new ParallelNode([
        new MultiConditionNode(ifCond, whileCond, name),
        node
    ], `IfThenDoWhile(${name})`);
}
