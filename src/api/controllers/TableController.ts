import database from '@root/api/db'
import { HttpException, IMCRequest, IMCResponse } from '@root/api/types'
import {
  addToResponse,
  applyQueryFilters,
  catchMiddleware,
  filterVisibleTableColumns,
  getColumnsWithRelations,
  getTableConfig,
  hasAuthorization,
  nextAndReturn,
  runHook
} from '@root/api/utils'
import { IColumnRelation, ITableInfo } from '@root/configGenerator'
import Bluebird from 'bluebird'
import Debug from 'debug'
import { NextFunction, Request } from 'express'
import Knex from 'Knex'

const debug = Debug('funfunzmc:controller-table')

interface IToRequestItem {
  values: Set<number>,
  key: string,
  display: string,
  foreignKeyColumn: string
}

interface IToRequest {
  [key: string]: IToRequestItem,
}

function toRequestBuilder(relation: IColumnRelation, columnName: string): IToRequestItem {
  return {
    values: new Set<number>(),
    key: relation.key,
    display: relation.display,
    foreignKeyColumn: columnName,
  }
}

class TableController {
  constructor() {
    debug('Created')
  }

  public getTableConfig(req: IMCRequest, res: IMCResponse, next: NextFunction) {
    const TABLE_CONFIG = getTableConfig(req.params.table)
    const RESULT = {
      columns: TABLE_CONFIG.columns,
      name: TABLE_CONFIG.name,
      pk: TABLE_CONFIG.pk,
      verbose: TABLE_CONFIG.verbose,
    }

    if (hasAuthorization(TABLE_CONFIG.roles, req.user)) {
      addToResponse(res, 'results')(RESULT)
      return nextAndReturn(next)(RESULT)
    } else {
      return catchMiddleware(next)(new HttpException(401, 'Not authorized'))
    }
  }

  public getTableData(req: IMCRequest, res: IMCResponse, next: NextFunction) {
    const PAGE_NUMBER = req.query.page || 0
    const TABLE_NAME = req.params.table
    const TABLE_CONFIG = getTableConfig(TABLE_NAME)
    const COLUMNS = filterVisibleTableColumns(TABLE_CONFIG, 'main')
    let LIMIT = 10

    if (!hasAuthorization(TABLE_CONFIG.roles, req.user)) {
      return catchMiddleware(next)(new HttpException(401, 'Not authorized'))
    }
    if (!database.db) {
      return catchMiddleware(next)(new HttpException(500, 'No database'))
    }
    const DB = database.db
    let QUERY = DB.select(COLUMNS).from(TABLE_NAME)
    if (req.query.filter) {
      QUERY = applyQueryFilters(QUERY, req.query.filter, TABLE_CONFIG)
    }

    if (req.query.limit) {
      LIMIT = parseInt(req.query.limit, 10)
    }
    if (LIMIT > 0) {
      QUERY.offset((PAGE_NUMBER) * LIMIT).limit(LIMIT)
    }

    return runHook(TABLE_CONFIG, 'getTableData', 'before', req, res, database.db).then(
      (hookResult) => {
        if (hookResult) {
          if (hookResult.filter) {
            Object.keys(hookResult.filter).forEach(
              (column) => {
                if (Array.isArray(hookResult.filter[column])) {
                  QUERY.whereIn(column, hookResult.filter[column])
                }
              }
            )
          }
        }
        return QUERY
      }
    ).then(
      (results) => {
        if (req.query.friendlyData) {
          return this.addVerboseRelatedData(results, TABLE_CONFIG, DB)
        }
        return results
      }
    ).then(
      (results) => {
        return runHook(TABLE_CONFIG, 'getTableData', 'after', req, res, database.db, results)
      }
    ).then(
      addToResponse(res, 'results')
    ).then(
      nextAndReturn(next)
    )
  }

  public getTableCount(req: IMCRequest, res: IMCResponse, next: NextFunction) {
    const TABLE_NAME = req.params.table
    const TABLE_CONFIG = getTableConfig(TABLE_NAME)

    if (!hasAuthorization(TABLE_CONFIG.roles, req.user)) {
      return catchMiddleware(next)(new HttpException(401, 'Not authorized'))
    } else {
      if (!database.db) {
        return catchMiddleware(next)(new HttpException(500, 'No database'))
      } else {
        return database.db.select('*').from(TABLE_NAME).then(
          (results) => {
            runHook(TABLE_CONFIG, 'getTableCount', 'after', req, res, database.db, results).then(
              addToResponse(res, 'count')
            ).then(
              nextAndReturn(next)
            )
          }
        )
      }
    }
  }

  public getRow(req: IMCRequest, res: IMCResponse, next: NextFunction) {
    const TABLE_NAME = req.params.table
    const TABLE_CONFIG = getTableConfig(TABLE_NAME)

    if (!hasAuthorization(TABLE_CONFIG.roles, req.user)) {
      return catchMiddleware(next)(new HttpException(401, 'Not authorized'))
    } else {
      if (!database.db) {
        return catchMiddleware(next)(new HttpException(500, 'No database'))
      } else {
        const requestedColumns = filterVisibleTableColumns(TABLE_CONFIG, 'detail')

        const query = database.db.select(requestedColumns)
          .from(`${req.params.table}`)
          .where(`id`, req.params.id)

        return query.then(
          (results) => {
            let relationQueries: Array<Bluebird<{}>> = []
            if (req.query.includeRelations) {
              relationQueries = this.getRelationQueries(TABLE_CONFIG, results[0].id)
            }

            if (relationQueries.length) {
              return Promise.all([
                results[0],
                ...relationQueries,
              ])
            }

            return Promise.all([
              results[0],
            ])
          }
        ).then(
          this.mergeRelatedData
        ).then(
          addToResponse(res, 'result')
        ).then(
          nextAndReturn(next)
        )
      }
    }
  }

  public insertRow(req: Request, res: IMCResponse, next: NextFunction) {
    if (!database.db) {
      return catchMiddleware(next)(new HttpException(500, 'No database'))
    } else {
      return database.db(req.params.table).insert(req.body.data).then(
        addToResponse(res, 'results')
      ).then(
        nextAndReturn(next)
      )
    }
  }

  public updateRow(req: Request, res: IMCResponse, next: NextFunction) {
    if (!database.db) {
      return catchMiddleware(next)(new HttpException(500, 'No database'))
    } else {
      return database.db(req.body.table).where('id', req.body.id).update(req.body.data).then(
        addToResponse(res, 'results')
      ).then(
        nextAndReturn(next)
      )
    }
  }

  public deleteRow(req: Request, res: IMCResponse, next: NextFunction) {
    if (!database.db) {
      return catchMiddleware(next)(new HttpException(500, 'No database'))
    } else {
      return database.db(req.params.table).where('id', req.params.id).del().then(
        addToResponse(res, 'results')
      ).then(
        nextAndReturn(next)
      )
    }
  }

  private addVerboseRelatedData(results: any[], TABLE_CONFIG: ITableInfo, DB: Knex) {
    const toRequest: IToRequest = {}
    const COLUMNS_WITH_RELATIONS = getColumnsWithRelations(TABLE_CONFIG)
    results.forEach(
      (row: any, index: number) => {
        COLUMNS_WITH_RELATIONS.forEach(
          (column) => {
            if (!column.relation) {
              throw new HttpException(500, 'Column should have a relation')
            }
            const RELATION_TABLE_NAME = column.relation.table

            if (!toRequest[RELATION_TABLE_NAME]) {
              toRequest[RELATION_TABLE_NAME] = toRequestBuilder(column.relation, column.name)
            }

            toRequest[RELATION_TABLE_NAME].values.add(row[column.name])
          }
        )
      }
    )

    const relationQueries: Knex.QueryBuilder[] = []
    Object.keys(toRequest).forEach(
      (tableName) => {
        relationQueries.push(
          DB.select(toRequest[tableName].display, toRequest[tableName].key)
            .from(tableName)
            .whereIn(toRequest[tableName].key, Array.from(toRequest[tableName].values.values()))
        )
      }
    )

    return Promise.all<any[]>(relationQueries).then(
      (relationResults) => {
        const MATCHER: {
          [foreignKeyColumn: string]: {
            [value: string]: string
          }
        } = {}
        Object.values(toRequest).forEach(
          (requestedTable, index) => {
            const FOREIGN_KEY_COLUMN = requestedTable.foreignKeyColumn
            MATCHER[FOREIGN_KEY_COLUMN] = {}
            relationResults[index].forEach(
              (relationRow: any) => {
                const CURRENT_VALUE = relationRow[requestedTable.key]
                const VALUE_TO_DISPLAY = relationRow[requestedTable.display]
                MATCHER[FOREIGN_KEY_COLUMN][CURRENT_VALUE] = VALUE_TO_DISPLAY
              }
            )
          }
        )
        return results.map(
          (row: any) => {
            Object.values(toRequest).forEach(
              (requestedTable) => {
                const ROW_KEY = requestedTable.foreignKeyColumn
                row[ROW_KEY] = MATCHER[ROW_KEY][row[ROW_KEY]]
              }
            )
            return row
          }
        )
      }
    )
  }

  private getRelationQueries(TABLE_CONFIG: ITableInfo, parentId: any) {
    const relationQueries: Array<Bluebird<{}>> = []
    if (TABLE_CONFIG.relations && TABLE_CONFIG.relations.manyToOne) {
      const MANY_TO_ONE = TABLE_CONFIG.relations.manyToOne
      const KEYS: string[] = Object.keys(MANY_TO_ONE)
      KEYS.forEach(
        (tableName) => {
          relationQueries.push(
            this.getRelatedRow(
              tableName,
              MANY_TO_ONE[tableName],
              parentId
            )
          )
        }
      )
    }

    return relationQueries
  }

  private getRelatedRow(tableName: string, columnName: string, parentId: any) {
    if (!database.db) {
      throw new HttpException(500, 'No database')
    }
    const TABLE_NAME = tableName
    const TABLE_CONFIG = getTableConfig(TABLE_NAME)

    const requestedColumns = filterVisibleTableColumns(TABLE_CONFIG, 'detail')
    return database.db.select(requestedColumns)
      .from(tableName)
      .where(columnName, parentId).then(
        (results) => ({
          results,
          tableName,
        })
      )
  }

  private mergeRelatedData([results, ...relations]: any) {
    if (relations && relations.length) {
      relations.forEach(
        (relation: {tableName: string, results: any[]}) => {
          results[relation.tableName] = relation.results
        }
      )
    }

    return results
  }
}

export default TableController
