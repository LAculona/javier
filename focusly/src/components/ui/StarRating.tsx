import { Star } from 'lucide-react';
import { cn } from '../../lib/cn';

export function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`Valoración: ${rating} de ${max} estrellas`}>
      {Array.from({ length: max }, (_, index) => (
        <Star
          key={index}
          aria-hidden="true"
          className={cn('size-4', index < rating ? 'fill-amber-400 text-amber-400' : 'fill-muted text-line-strong')}
        />
      ))}
    </div>
  );
}
