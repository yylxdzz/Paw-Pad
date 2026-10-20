import { defineConfig } from "vitest/config";

// 集成测试专用配置：node 环境，只收 src 下的 *.test.ts。
// 独立文件而非并入 vite.config.ts——测试不需要 React/vite 插件，也不碰产品构建配置。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
