import { Hero, defineComponent } from "niceeval/report";

const GITHUB_URL = "https://github.com/CorrectRoadH/memorybench";

export const MemoryBenchHero = defineComponent(() => (
    <Hero
      description={{
        en: "Benchmark for AI Agent in Memory",
        "zh-CN": "AI Agent 记忆的基准测试",
      }}
      links={[
        {
          label: {
            en: "Star on GitHub",
            "zh-CN": "Star on GitHub",
          },
          href: GITHUB_URL,
        },
      ]}
    />
));

MemoryBenchHero.displayName = "MemoryBenchHero";
