# Prefab 系统设计

`prefab` 的职责不是保存一个实体实例，而是定义“一个实体在生成时应该如何被装配出来”。

对应目录：

- `src/prefabs`

## 当前结构

- `PrefabDef.ts`
  定义 prefab 的结构
- `PrefabRegistry.ts`
  负责注册和查询 prefab
- `spawnPrefab.ts`
  负责根据 prefab 定义真正生成实体

## 当前 prefab 可以定义什么

- `name`
- `displayName`
- `tags`
- `components`
- `setup(inst, context)`
- `createStateGraph(inst, context)`
- `createBrain(inst, context)`
- `createPhysics(inst, context)`

## 设计原则

### 1. prefab 是定义，不是实例

prefab 里保存的是“如何创建”，不是“已经创建好的对象”。

所以：

- `Brain` 必须每次现建
- `StateGraph` 必须每次现建
- `Physics` 也只定义默认配置，不共享实例

### 2. physics 在 prefab 里只是默认描述

prefab 里可以写：

- shape
- body type
- layer

但真正是否 attach 到 physics world，仍然由当前 `world.physics` 是否存在决定。

### 3. context 用来传生成时参数

例如：

- 出生位置
- 所属 world
- 所属 map
- 目标实体
- 特殊初始化数据

这让像 `spider` 这种依赖目标玩家创建 brain 的 prefab 也能自然工作。

## 当前 example 的使用方式

示例已经改成通过 prefab 生成：

- `player`
- `spider`
- `berries`
- `rock_obstacle`

对应文件：

- `src/examples/examplePrefabs.ts`
- `src/examples/createExampleGame.ts`

## 后续建议

下一步最值得补的是：

1. prefab 的序列化标识
   让存档时能保存“这个实体是由哪个 prefab 生成的”
2. prefab 资源描述
   例如 sprite key、动画 key、音效 key
3. prefab 继承/复用
   例如 monster 基础定义再派生 spider、hound、pigman
