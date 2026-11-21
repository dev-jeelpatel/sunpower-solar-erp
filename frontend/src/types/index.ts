import type { ReactNode } from 'react';

export type Role = 'admin' | 'sales' | 'technician' | 'warehouse' | 'support' | 'director';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

/** Field-level validation messages returned by the API (and used by client-side validation). */
export type FieldErrors = Record<string, string | undefined>;

export type Children = { children?: ReactNode };

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type Tone = 'accent' | 'good' | 'bad';
