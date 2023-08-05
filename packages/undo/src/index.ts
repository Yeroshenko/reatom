import {
  Action,
  action,
  atom,
  Atom,
  AtomCache,
  AtomMut,
  AtomState,
  Ctx,
  Fn,
  isAction,
  isAtom,
  Rec,
  throwReatomError,
  __count,
  CtxSpy,
} from '@reatom/core'
import { isCausedBy } from '@reatom/effects'
import { onConnect, withInit } from '@reatom/hooks'
import { isShallowEqual, noop, Plain } from '@reatom/utils'

export interface WithUndo<T = any> {
  clearHistory: Action<[], void>
  historyAtom: Atom<Array<T>>
  positionAtom: Atom<number>
  isRedoAtom: Atom<boolean>
  isUndoAtom: Atom<boolean>
  jump: Action<[by: number], T>
  redo: Action<[], T>
  undo: Action<[], T>
}

export interface WithUndoOptions<T = any> {
  length?: number
  shouldUpdate?: Fn<[ctx: Ctx, state: T, history: Array<T>], boolean>
  shouldReplace?: Fn<[ctx: Ctx, state: T, history: Array<T>], boolean>
}

const update = (ctx: Ctx, anAtom: AtomMut | Atom, state: any) =>
  typeof anAtom === 'function'
    ? anAtom(ctx, state)
    : ctx.get((read, actualize) =>
        actualize!(ctx, anAtom.__reatom, (patchCtx: Ctx, patch: AtomCache) => {
          patch.state = state
        }),
      ).state

export const withUndo =
  <T extends AtomMut & Partial<WithUndo<AtomState<T>>>>({
    length = 30,
    shouldUpdate = () => true,
    shouldReplace = () => false,
  }: WithUndoOptions<AtomState<T>> = {}): Fn<[T], T & WithUndo<AtomState<T>>> =>
  (anAtom) => {
    throwReatomError(isAction(anAtom) || !isAtom(anAtom), 'atom expected')

    if (!anAtom.undo) {
      const { name } = anAtom.__reatom

      const historyAtom = (anAtom.historyAtom = atom<Array<AtomState<T>>>(
        [],
        `${name}.Undo._historyAtom`,
      ).pipe(withInit((ctx) => [ctx.get(anAtom)])))

      const positionAtom = (anAtom.positionAtom = atom(0, `${name}._position`))

      anAtom.isUndoAtom = atom(
        (ctx) => ctx.spy(positionAtom) > 0,
        `${name}.Undo._isUndoAtom`,
      )

      anAtom.isRedoAtom = atom(
        (ctx) => ctx.spy(positionAtom) < ctx.spy(historyAtom).length - 1,
        `${name}.Undo._isRedoAtom`,
      )

      const jump = (anAtom.jump = action((ctx, by: number) => {
        const history = ctx.get(historyAtom)
        const position = ctx.get(positionAtom)
        const to = Math.max(0, Math.min(history.length - 1, position + by))

        return update(ctx, anAtom, history[positionAtom(ctx, to)])
        // return anAtom(ctx, history[positionAtom(ctx, to)])
      }, `${name}.Undo._jump`))

      anAtom.undo = action((ctx) => jump(ctx, -1), `${name}.Undo.undo`)

      anAtom.redo = action((ctx) => jump(ctx, 1), `${name}.Undo.redo`)

      anAtom.clearHistory = action((ctx) => {
        historyAtom(ctx, () => [ctx.get(anAtom)])
        positionAtom(ctx, 0)
      }, `${name}.Undo.clearHistory`)

      anAtom.onChange((ctx, state) => {
        if (
          !isCausedBy(ctx.cause, jump.__reatom) &&
          shouldUpdate(ctx, state, ctx.get(historyAtom))
        ) {
          historyAtom(ctx, (history) => {
            let position = ctx.get(positionAtom)
            if (history[history.length - 1] !== state) {
              history = history.slice(-length + 1)
              if (history.length !== position - 1) {
                history.length = position + 1
              }
              if (!shouldReplace(ctx, state, history)) {
                position++
              }
              history[position] = state
            }
            positionAtom(ctx, position)
            return history
          })
        }
      })
    }

    return anAtom as any
  }

type AtomsStates<T> = Plain<{
  [K in keyof T]: AtomState<T[K]>
}>

interface UndoAtom<T> extends Atom<T>, WithUndo<T> {}

export const reatomUndo = <T extends Array<AtomMut> | Rec<AtomMut>>(
  shape: T,
  options: string | (WithUndoOptions<AtomsStates<T>> & { name?: string }) = {},
): UndoAtom<AtomsStates<T>> => {
  const {
    name = __count('undoAtom'),
    length,
    shouldUpdate,
    shouldReplace,
  }: Exclude<typeof options, string> = typeof options === 'string'
    ? { name: options }
    : options

  const theAtom = Object.assign(
    (ctx: Ctx, newShape: AtomsStates<T>): AtomsStates<T> => {
      for (const [key, anAtom] of Object.entries(shape)) {
        if (!Object.is(ctx.get(anAtom), newShape[key as keyof T])) {
          anAtom(ctx, newShape[key as keyof T])
        }
      }
      return ctx.get(theAtom)
    },
    atom((ctx, state = (Array.isArray(shape) ? [] : {}) as AtomsStates<T>) => {
      const newState = Object.entries(shape).reduce(
        (acc, [key, anAtom]) => ((acc[key as keyof T] = ctx.spy(anAtom)), acc),
        (Array.isArray(shape) ? [] : {}) as AtomsStates<T>,
      )
      return isShallowEqual(state, newState) ? state : newState
    }, name),
  ).pipe(withUndo({ length, shouldUpdate, shouldReplace }))

  return theAtom
}

export const reatomDynamicUndo = (
  collector: (ctx: CtxSpy) => void,
  options: string | (WithUndoOptions<AtomCache> & { name?: string }) = {},
): UndoAtom<AtomCache> => {
  const {
    name = __count('dynamicUndoAtom'),
    length,
    shouldUpdate,
    shouldReplace,
  }: Exclude<typeof options, string> = typeof options === 'string'
    ? { name: options }
    : options

  const theAtom = Object.assign(
    (ctx: Ctx, newState: AtomCache): AtomCache => {
      for (const { state, proto } of newState.pubs) {
        const anAtom = { __reatom: proto } as Atom
        if (!proto.isAction && !Object.is(ctx.get(anAtom), state)) {
          update(ctx, anAtom, state)
        }
      }

      return ctx.get(theAtom)
    },
    atom((ctx) => {
      collector(ctx)
      return ctx.cause
    }, name),
  ).pipe(withUndo({ length, shouldUpdate, shouldReplace }))

  onConnect(theAtom.historyAtom, (ctx) => ctx.subscribe(theAtom, noop))
  onConnect(theAtom.positionAtom, (ctx) => ctx.subscribe(theAtom, noop))

  return theAtom
}
