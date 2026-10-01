import { defineConfig } from "./src/config/index.ts";

export default defineConfig({
  username: "kboshold",
  orgs: ["boshold"],
  gist: {
    id: "ab2d9bf8ae29c3f61f892b67fb3282a2",
  },
  cards: {
    topLangs: {
      width: 437,
      height: 195,
      textSize: 13,
      percentGap: 10,
      percentSeparator: "•",
      hide: ["html", "scss", "css"],
    },
  },
});
