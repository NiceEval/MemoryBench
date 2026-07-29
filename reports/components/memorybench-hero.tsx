import { Hero, defineComponent } from "niceeval/report";

const GITHUB_URL = "https://github.com/CorrectRoadH/memorybench";
const LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="g" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
        <stop stop-color="#a78bfa"/>
        <stop offset="1" stop-color="#6d28d9"/>
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="17" fill="url(#g)"/>
    <path d="M17 43V21l15 14 15-14v22" fill="none" stroke="white" stroke-width="5.5"
      stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M15 49h34" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"
      opacity=".9"/>
  </svg>
`.trim())}`;

export const MemoryBenchHero = defineComponent(() => (
    <Hero
      logo={{ src: LOGO_DATA_URI, alt: "MemoryBench" }}
      description={{
        en: "MemoryBench asks whether memory helps coding agents ship better code. It runs the same real-world development tasks with the same model and verifier, changing only the memory condition, then compares task success, time, turns, tokens, retries, and repeated mistakes.",
        "zh-CN": "MemoryBench 评测记忆能否帮助 coding agent 交付更好的代码。它让同一个模型完成同一批真实开发任务，并使用相同的 verifier，只改变 memory 条件，再比较任务完成率、时间、轮次、token、重试和重复犯错。",
      }}
      links={[
        {
          label: {
            en: "Explore the benchmark on GitHub →",
            "zh-CN": "在 GitHub 上了解这个评测 →",
          },
          href: GITHUB_URL,
        },
      ]}
    />
));

MemoryBenchHero.displayName = "MemoryBenchHero";
