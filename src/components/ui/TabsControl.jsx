import { Tabs } from '@base-ui/react/tabs';
import { cn } from '../../lib/utils/cn.js';

/**
 * Composable dual-theme Tabs built on @base-ui/react/tabs.
 */
export function TabsControl({
  value,
  defaultValue,
  onValueChange,
  items = [],
  className,
  listClassName,
}) {
  return (
    <Tabs.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onValueChange}
      className={cn('flex flex-col gap-4', className)}
    >
      <Tabs.List
        className={cn(
          'relative inline-flex items-center gap-1 rounded-xl border border-border bg-muted/60 p-1 w-fit max-w-full overflow-x-auto',
          listClassName
        )}
      >
        {items.map((item) => (
          <Tabs.Tab
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className="relative z-1 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground whitespace-nowrap transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[selected]:bg-card data-[selected]:text-foreground data-[selected]:shadow-2xs data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {items.map((item) => (
        <Tabs.Panel key={item.value} value={item.value} className="outline-none">
          {item.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
