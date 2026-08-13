// 当前 Report host 不暴露旧版 component/attempt reader API。
// 这个冒烟入口复用生产报告，以确认 --report 模块能按公开契约加载。
export { default } from "../reports/memory.tsx";
