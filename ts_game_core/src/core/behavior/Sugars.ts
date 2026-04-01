import { Entity } from "../Entity";
import { BehaviorNode } from "./Node";
import { ParallelNode, Sequence } from "./Composites";
import { ConditionNode, MultiConditionNode } from "./Leaves";

// While 语法糖：条件成立时持续执行子节点。
export function WhileNode(cond: (inst: Entity) => boolean, name: string, node: BehaviorNode): BehaviorNode {
    return new ParallelNode([
        new ConditionNode(cond, name),
        node
    ], `While(${name})`);
}

// If 语法糖：条件成立时执行一次子节点。
export function IfNode(cond: (inst: Entity) => boolean, name: string, node: BehaviorNode): BehaviorNode {
    const seq = new Sequence([
        new ConditionNode(cond, name),
        node
    ]);
    seq.name = `If(${name})`;
    return seq;
}

// IfThenDoWhile 语法糖：先用 ifCond 启动，再用 whileCond 维持执行。
export function IfThenDoWhileNode(ifCond: (inst: Entity) => boolean, whileCond: (inst: Entity) => boolean, name: string, node: BehaviorNode): BehaviorNode {
    return new ParallelNode([
        new MultiConditionNode(ifCond, whileCond, name),
        node
    ], `IfThenDoWhile(${name})`);
}
