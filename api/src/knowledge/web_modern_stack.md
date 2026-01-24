# Modern Web Development: The Pinnacle Stack

## 1. Next.js 14 & App Router
The modern web is built on React Server Components (RSC).
- **Architecture**: Move logic to the server. `page.tsx` is server-side by default.
- **Data Fetching**: Use `async/await` directly in components. No more `useEffect` for data.
- **Caching**: `fetch` is cached by default. Use `revalidatePath` to purge.

### Project Structure (Professional)
```
/app
  /dashboard
    layout.tsx (Dashboard wrap)
    page.tsx (Main view)
    loading.tsx (Suspense boundary)
    error.tsx (ErrorBoundary)
  api/
    route.ts (Edge API Routes)
/components
  /ui (Atomic design: Button, Card)
  /features (Business logic)
/lib
  utils.ts (cn helper)
  db.ts (Prisma/Drizzle singleton)
```

## 2. Styling: TailwindCSS + Shadcn/UI
Do not write CSS files. Use Utility Classes.
- **Why?** Collocation of style and logic. Smaller bundle size.
- **Structure**: `className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background"`
- **Theming**: Use CSS variables in `globals.css` for Dark Mode support (Hsl formatted).

## 3. State Management
- **Server State**: React Query (TanStack Query) is mandatory for client-side fetching.
- **Global Client State**: Zustand (lightweight) over Redux.
- **Form State**: React Hook Form + Zod validation.

## 4. Performance Optimization
- **Images**: Always use `next/image` with specific sizes.
- **Fonts**: `next/font` removes CLS (Cumulative Layout Shift).
- **Lazy Loading**: `const HeavyComponent = dynamic(() => import('./Heavy'))`.
- **Edge**: Deploy to Vercel Edge Networks for <30ms TTFB.
