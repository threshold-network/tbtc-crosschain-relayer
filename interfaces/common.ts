import type { Listener } from '@ethersproject/providers';
import type { Event, EventFilter } from 'ethers';

// Generic constraint for event arguments - must be an array-like structure
export interface TypedEvent<
  TArgsArray extends readonly unknown[] = readonly unknown[],
  TArgsObject = Record<string, unknown>,
> extends Event {
  args: TArgsArray & TArgsObject;
}

export type TypedEventFilter<_TEvent extends TypedEvent> = EventFilter;

export interface TypedListener<TEvent extends TypedEvent> {
  (...listenerArg: [...__TypechainArgsArray<TEvent>, TEvent]): void;
}

type __TypechainArgsArray<T> = T extends TypedEvent<infer U> ? U : never;

export interface OnEvent<TRes> {
  <TEvent extends TypedEvent>(
    eventFilter: TypedEventFilter<TEvent>,
    listener: TypedListener<TEvent>,
  ): TRes;
  (eventName: string, listener: Listener): TRes;
}

// Improved factory interface with proper generic constraints
export type MinEthersFactory<C, ARGS extends readonly unknown[]> = {
  deploy(...a: ARGS): Promise<C>;
};

export type GetContractTypeFromFactory<F> =
  F extends MinEthersFactory<infer C, readonly unknown[]> ? C : never;

export type GetARGsTypeFromFactory<F> =
  F extends MinEthersFactory<unknown, infer ARGS> ? ARGS : never;
