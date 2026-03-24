# 《饥荒》复刻版（TS Game Core）引擎架构指南

本文档记录了基于《饥荒》（Don't Starve）底层设计哲学构建的 TypeScript 游戏核心架构。可用于明天继续开发时的快速唤醒和查阅。

## 🌟 核心理念与四大支柱系统

我们的底层逻辑高度解耦，严格贯彻了 **“意图产生 -> 距离/环境校验 -> 动画播放 -> 动画关键帧执行”** 的游戏循环。

主要由以下四大系统组成：

### 1. ECS 底层结构 (`Entity.ts` & `Component.ts`)
纯粹的组件式架构与基于位掩码（Bitmask）的事件分发系统。
- 所有的数据交互都依赖于 `inst.getComponent(...)`。
- 事件分发通过 `listenForEvent` 与 `pushEvent` 实现跨组件的无痕通信。

### 2. StateGraph（状态机组件 `StateGraph.ts` / `StateCore.ts`）
负责控制实体的所有视听表现、时间轴控制和状态互斥。
- **状态守卫（Guard）**：借助 `excludeTags` 和 `canEnter()` 强行拒绝非法的状态跃迁（例如死亡时拒绝接受受击、忙碌时拒绝接受其他攻击等）。
- **时间轴驱动（Timeline）**：游戏动画的灵魂。动作不是在按下的一瞬间生效，而是由 StateGraph 动画到达关键帧（例如 0.5s 处决帧）时，抛出 `action_frame` 事件来决定生效时机。

### 3. Action 系统 (`Action.ts`)
负责定义全游戏所有的交互行为（如：砍树、攻击、吃东西）。
- **`Action`**：蓝图，定义了动作名、需要的 **交互距离 (`distance`)**、绑定的 **动画状态 (`sgState`)** 以及最终生效时的回调逻辑 (`fn`)。
- **`BufferedAction`**：实例，包装了“谁 (`doer`) 用了什么东西 对 谁 (`target`) / 在哪里 (`pos`) 做了什么事 (`action`)”。这是 AI 或玩家生成意图的载体。

### 4. Locomotor 系统 (`Locomotor.ts` & `Transform.ts`)
最核心的“跑腿管家”，承接了动作意图与物理世界的鸿沟。
- 当接收到 `BufferedAction` 时，Locomotor 会调用 `Transform` 计算自身与目标的物理坐标距离。
- **自动寻路**：如果距离不够，它会自动托管实体切入 `walk` 状态，强行改变 `x, z` 坐标向目标冲刺。
- **触发动画**：一旦踏入生效范围内，立刻终止走路，剥夺控制权交给特定的动作动画（如 `attack`）。
- **完美解耦**：当动画抛出 `action_frame` 时，Locomotor 才真正执行动作的底层伤害结算。此中不会受到任何非法打断状态的污染。

---

## 🔁 核心执行回路 (The Game Loop)

要快速搞懂这套引擎到底发生了什么，只需要记住这个经典的循环：

1. **大脑 (AI Brain)** 指向了前方的敌人，高喊：“我想打他！”并生成了 `ACTIONS.ATTACK` 的 BufferAction。
2. 动作被塞入了 **Locomotor**。
3. **Locomotor** 发现目标在 10 米外，而长矛射程只有 2 米。
4. **Locomotor** 强令怪物走起来 (`goToState("walk")`)，并在每一帧计算距离拉近。
5. 当距离 <= 2 米时，**Locomotor** 立刻停车，并高喊 (`goToState("attack")`) 播放攻击动画。
6. **StateGraph** 开始播放攻击动画，时间推进到了 0.5s 那只蜘蛛高高跃起的帧。
7. **StateGraph** 说：“这一帧到了，我广播出去了 (`inst.pushEvent("action_frame")`)”。
8. 一直在潜伏监听的 **Locomotor** 收到了信号，立刻调用 `action.fn()` 劈出了实打实的 20 点伤害。
9. 攻击结束，系统回归 Idle，等待大脑的下一个判断。

---

## 🚀 明天的下一步 (Next Steps)

按照《饥荒》的开发路线，接下来我们最适合攻克的模块有：

*   **[脑图模块] 行为树大脑 (Brain / BT)**：让实体能够真正在每帧通过一套（Sequence / Selector）巡检规则，发现敌人、远离危险，然后像人类一样向 Locomotor 推送 BufferAction。
*   **[物品模块] 收集系统 (Inventory)**：制作掉落物（Item）与拾取动作 (`ACTIONS.PICKUP`)，测试能否让玩家通过点击走过去并捡入包里。
*   **[移动模块] 寻路优化**：给 Locomotor 加上真实的物理速度属性获取，避免硬编码 3.0 m/s，并处理撞墙碰撞（Collision）。
