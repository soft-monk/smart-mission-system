// Seed.h —— 首次启动播种演示数据（两场景，契约 §6/§7）
#pragma once

namespace mapapp {

class Seed {
public:
    // 库为空时写入两个场景的完整演示数据；非空则直接返回 true
    static bool seedIfEmpty();
};

}  // namespace mapapp
