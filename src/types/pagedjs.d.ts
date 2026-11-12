declare module "pagedjs" {
	export class Previewer {
		polisher: { destroy(): void };
		preview(
			content: string | DocumentFragment,
			stylesheets: (string | Record<string, string>)[],
			renderTo: HTMLElement,
		): Promise<{ total: number }>;
	}
}
