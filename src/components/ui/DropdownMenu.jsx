import { Menu } from '@base-ui/react/menu';
import { cn } from '../../lib/utils/cn.js';

export function DropdownMenu({
  trigger,
  items = [],
  align = 'end',
  sideOffset = 6,
  className,
}) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner align={align} sideOffset={sideOffset} className="z-50">
          <Menu.Popup
            className={cn(
              'min-w-44 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none',
              className
            )}
          >
            {items.map((item, idx) =>
              item.type === 'separator' ? (
                <Menu.Separator key={`sep-${idx}`} className="my-1 h-px bg-border" />
              ) : (
                <Menu.Item
                  key={item.id || item.label}
                  disabled={item.disabled}
                  onClick={item.onClick}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none select-none data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                    item.danger && 'text-destructive data-[highlighted]:bg-destructive/12'
                  )}
                >
                  {item.icon && <span className="shrink-0">{item.icon}</span>}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.shortcut && (
                    <kbd className="font-mono text-[11px] text-muted-foreground">
                      {item.shortcut}
                    </kbd>
                  )}
                </Menu.Item>
              )
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
