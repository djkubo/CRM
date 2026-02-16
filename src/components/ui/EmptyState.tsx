import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="rounded-2xl bg-muted/30 p-5 mb-4">
                <Icon className="h-10 w-10 text-muted-foreground/60" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-1">{title}</h3>
            {description && (
                <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
            )}
            {actionLabel && onAction && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onAction}
                    className="mt-4"
                >
                    {actionLabel}
                </Button>
            )}
        </div>
    );
}
