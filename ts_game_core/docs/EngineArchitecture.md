# TS Game Core Architecture

`ts_game_core` is a TypeScript gameplay core inspired by the architecture of Don't Starve.
The current goal is not to clone every Lua module one by one, but to preserve the key gameplay loop:

`intent -> action buffering -> movement/range validation -> stategraph animation -> frame event -> effect resolution`

## Core layers

### Entity + Component

- `Entity` owns components, event dispatch, tags, brain, and stategraph.
- `Component` is lightweight and opt-in for frame updates.
- Tags are bitmasks so gameplay checks stay cheap.

### Action + Locomotor

- `Action` defines what an interaction does, its required range, and optional stategraph state.
- `BufferedAction` is the concrete intent issued by AI or player input.
- `Locomotor` is the executor that moves into range and hands control to the matching animation state.

### StateGraph

- `StateGraph` owns logical state transitions, timeline events, and interruption rules.
- Actions become authoritative only when a timeline event fires, usually `action_frame`.
- This keeps gameplay timing aligned with animation timing.

### Brain

- `Brain` evaluates behavior nodes and emits `BufferedAction`s.
- AI and player control should converge on the same action pipeline.

## Current vertical slices

- AI chase and attack
- Player pickup and inventory insertion

## Recommended next milestones

1. Add an action picker layer so player input also generates `BufferedAction`s through a resolver.
2. Expand interactions from `PICKUP` into `USE`, `EQUIP`, and `TALK`.
3. Separate locomotion from collision/pathfinding so movement can later plug into a real scene runtime.
4. Add lightweight tests around stategraph timing and action completion.
