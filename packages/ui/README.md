# @rentos/ui

RentOS shared UI component library, built on TailwindCSS v4 and shadcn/ui
conventions, consumed by `@rentos/web` and future frontend surfaces.

- `src/lib/utils.ts` — `cn()` class-name helper (clsx + tailwind-merge).
- `src/components/` — shadcn/ui-style components: `Button`, `Input`,
  `Label`, `Card` (+ sub-components), `Alert`.
- `src/styles/theme.css` — shared design tokens (`@theme`), imported by
  consuming apps' global stylesheet.

## Adding components

New shadcn/ui components can be generated with the shadcn CLI targeting this
package, or hand-authored following the same convention: a Tailwind-styled,
accessible component built on Radix primitives and `class-variance-authority`
for variants, exported from `src/index.ts`.
