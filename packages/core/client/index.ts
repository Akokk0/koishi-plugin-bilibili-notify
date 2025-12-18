// biome-ignore assist/source/organizeImports: <import type>
import Settings from "./settings.vue";
import type { Context } from "@koishijs/client";

export default (ctx: Context) => {
	ctx.slot({
		type: "plugin-details",
		component: Settings,
		order: 0,
	});
};
