import { IQueryArgs, DataConnector, ICreateArgs, IRemoveArgs, IUpdateArgs } from './connector'
import { ExecuteGraphQL } from './graphql'

export type OperationTypes = 'all' | 'config' | 'count' | 'add' | 'query' | 'update' | 'delete'
export type HookTypes = 'beforeResolver' | 'beforeSendQuery' | 'afterQueryResult' | 'afterResultSent'

export interface IArgs {
  [key: string]: unknown
}

export interface IHookProps<U, C> {
  graph: ExecuteGraphQL
  connector: DataConnector
  user: U
  args: IArgs
  query?: IQueryArgs | IUpdateArgs | ICreateArgs | IRemoveArgs
  results?: unknown
  context?: C
}

export type HookFunction<U, C> = (props: IHookProps<U, C>) => Promise<IHookProps<U, C>>

export type ITableHooks = {
  [key in OperationTypes]?: {
    [key in HookTypes]?: HookFunction<unknown, unknown>
  }
}