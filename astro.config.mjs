import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://structure-lab.pages.dev',
	integrations: [
		mdx(),
		sitemap({
			filter: (page) => page !== '/links',
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	}
});
