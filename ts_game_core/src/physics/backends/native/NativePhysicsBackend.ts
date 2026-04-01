import { StubPhysicsBackend } from "../stub/StubPhysicsBackend";

// 原生后端占位实现：后续可替换为 Bullet/PhysX/Jolt 等原生桥接实现。
export class NativePhysicsBackend extends StubPhysicsBackend {}
