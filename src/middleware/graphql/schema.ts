'use strict'
import mutations from './mutations'
import { buildQueries } from './queries'
import Debug from 'debug'
import {
  GraphQLObjectType,
  GraphQLSchema,
} from 'graphql'
import { IUser } from '../types'
import { Request, Response } from 'express'

export type TUserContext = {
  user: IUser,
  req: Request,
  res: Response
}

const debug = Debug('funfunz:graphql-schema')

export let schema: GraphQLSchema

// export the schema
export default (): GraphQLSchema => {
  debug('Creating graphql schema')
  // lets define our root query
  const RootQuery = new GraphQLObjectType({
    name: 'RootQueryType',
    description: 'This is the default root query provided by our application',
    fields: {
      ...buildQueries(),
    },
  })
  const RootMutation = new GraphQLObjectType({
    name: 'Mutation',
    description: 'This is the default root mutation provided by our application',
    fields: {
      ...mutations(),
    },
  })

  schema = new GraphQLSchema({
    query: RootQuery,
    mutation: RootMutation,
  })
  return schema
}
