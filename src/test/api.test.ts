import { GraphQLList, GraphQLFloat, GraphQLInt } from 'graphql'
import request from 'supertest'
import { Funfunz } from '../middleware'

import config from './configs/config'
import entities from './configs/entities'

import { authenticatedServer } from './utils'

let randomNumberCount = 4

const application = new Funfunz({
  config,
  entities,
  queries: {
    randomNumbers: {
      type: new GraphQLList(GraphQLFloat),
      description: 'This will return a list of random numbers.',
      resolve: () => {
        return Array.from({length: randomNumberCount}, () => Math.random())
      },
    }
  },
  mutations: {
    increaseRandomNumber: {
      type: GraphQLInt,
      description: 'This will increase and return the quantity of random numbers.',
      resolve: () => {
        return randomNumberCount += 1
      },
    },
    decreaseRandomNumber: {
      type: GraphQLInt,
      description: 'This will decrease and return the quantity of random numbers.',
      resolve: () => {
        return randomNumberCount -= 1
      },
    }
  }
}).middleware
const authApplication = authenticatedServer(application)

let familyTestName = 'TestFamily'
let familyTestUpdateName = 'TestedFamily'
let familyId: number

describe('graphql', () => {
  it('mutation to add families', (done) => {
    return request(authApplication)
    .post('/api')
    .send({
      query: `
      mutation {
        addFamilies (
          data: {
            name: "${familyTestName}"
          }
        ){
          id
          name
        }
      }`,
    })
    .set('Accept', 'application/json').end(
      (err, response) => {
        if (err) {
          return done(err)
        }
        expect(response.status).toBe(200)
        expect(response.body).toBeTruthy()
        const data = response.body.data
        expect(Array.isArray(data.addFamilies)).toBeTruthy()
        expect(data.addFamilies[0].id).toBeTruthy()
        expect(data.addFamilies[0].name).toBeTruthy()
        expect(data.addFamilies[0].name).toEqual(familyTestName)
        familyId = data.addFamilies[0].id
        return done()
      }
    )
  })

  it('update created family', (done) => {
    return request(authApplication)
    .post('/api')
    .send({
      query: `
      mutation {
        updateFamilies (
          take: 1
          skip: 0
          filter: {
            id: {
              _eq: ${familyId}
            }
          }
          data: {
            name: "${familyTestUpdateName}"
          }
        ){
          id
          name
        }
      }`,
    })
    .set('Accept', 'application/json').end(
      (err, response) => {
        if (err) {
          return done(err)
        }
        expect(response.status).toBe(200)
        expect(response.body).toBeTruthy()
        const data = response.body.data
        expect(Array.isArray(data.updateFamilies)).toBeTruthy()
        expect(data.updateFamilies[0].id).toBeTruthy()
        expect(data.updateFamilies[0].name).toBeTruthy()
        expect(data.updateFamilies[0].name).toEqual(familyTestUpdateName)
        return done()
      }
    )
  })
  it('delete created family', (done) => {
    return request(authApplication)
    .post('/api')
    .send({
      query: `
      mutation {
        deleteFamilies (
          filter: {
            id: {
              _eq: ${familyId}
            }
          }
        ){
          deleted
        }
      }`,
    })
    .set('Accept', 'application/json').end(
      (err, response) => {
        if (err) {
          return done(err)
        }
        expect(response.status).toBe(200)
        expect(response.body).toBeTruthy()
        const data = response.body.data
        expect(data.deleteFamilies).toBeTruthy()
        expect(data.deleteFamilies.deleted).toEqual(1)
        return done()
      }
    )
  })
  it('update product price', (done) => {
    return request(authApplication)
    .post('/api')
    .send({
      query: `
      mutation {
        updateProducts (
          take: 1
          skip: 0
          filter: {
            id: {
              _eq: 1
            }
          }
          data: {
            price: 1.2
          }
        ){
          id
          price
        }
      }`,
    })
    .set('Accept', 'application/json').end(
      (err, response) => {
        if (err) {
          return done(err)
        }
        expect(response.status).toBe(200)
        expect(response.body).toBeTruthy()
        const data = response.body.data
        expect(Array.isArray(data.updateProducts)).toBeTruthy()
        expect(data.updateProducts[0].id).toBeTruthy()
        expect(data.updateProducts[0].price).toEqual(1.2)
        return done()
      }
    )
  })
  it('query data', (done) => {
    return request(authApplication)
    .post('/api')
    .send({
      query: `
      query {
        families (
          filter: {
            id: {
              _eq: 1
            }
          }
        ){
          id
          products (
            filter: {
              _and: [
                {
                  id: {
                    _in: [1,2,3,4]
                  }
                }
                {
                  _or: [
                    {
                      name: {
                        _like: "name1"
                      }
                    }
                    {
                      name: {
                        _like: "name2"
                      }
                    }
                  ]
                }
              ]
            }
          ){
            id
            name
            FamilyId
            families {
              id
            }
          }
        }
      }`,
    })
    .set('Accept', 'application/json').end(
      (err, response) => {
        if (err) {
          return done(err)
        }
        expect(response.status).toBe(200)
        expect(response.body).toBeTruthy()
        const data = response.body.data
        expect(data).toMatchObject({
          families: [
            {
              id: 1,
              products: [
                {
                  id: 1,
                  name: 'name1',
                  FamilyId: 1,
                  families: {
                    id: 1
                  }
                },
                {
                  id: 2,
                  name: "name2",
                  FamilyId: 1,
                  families: {
                    id: 1
                  }
                }
              ]
            }
          ]
        })
        return done()
      }
    )
  })

  it('query no data result', (done) => {
    return request(authApplication)
    .post('/api')
    .send({
      query: `
      query {
        families (
          filter: {
            id: {
              _eq: 1234
            }
          }
        ){
          id
          name
        }
      }`,
    })
    .set('Accept', 'application/json').end(
      (err, response) => {
        if (err) {
          return done(err)
        }
        expect(response.status).toBe(200)
        expect(response.body).toBeTruthy()
        const data = response.body.data
        expect(data).toMatchObject({
          "families": []
        })
        return done()
      }
    )
  })

  it('query count data', (done) => {
    return request(authApplication)
    .post('/api')
    .send({
      query: `
      query {
        imagesCount
      }`,
    })
    .set('Accept', 'application/json').end(
      (err, response) => {
        if (err) {
          return done(err)
        }
        expect(response.status).toBe(200)
        expect(response.body).toBeTruthy()
        const data = response.body.data
        expect(data.imagesCount).toBe(102)
        return done()
      }
    )
  })

  it('query secure data', (done) => {
    return request(authApplication)
    .post('/api')
    .send({
      query: `
      query {
        users {
          id
          roles {
            id
          }
        }
      }`,
    })
    .set('Accept', 'application/json').end(
      (err, response) => {
        if (err) {
          return done(err)
        }
        expect(response.status).toBe(200)
        expect(response.body).toBeTruthy()
        const data = response.body.data
        expect(data).toBeTruthy()
        expect(data.users).toBeTruthy()
        expect(data.users[0]).toBeTruthy()
        expect(data.users[0].id).toBeTruthy()
        const userWithRoles = data.users.find(u => u.roles && u.roles.length)
        expect(userWithRoles.roles[0].id).toBeTruthy()
        return done()
      }
    )
  })

  it('query secure data unauthorized', (done) => {
    return request(application)
    .post('/api')
    .send({
      query: `
      query {
        users {
          id
        }
      }`,
    })
    .set('Accept', 'application/json').end(
      (err, response) => {
        if (err) {
          return done(err)
        }
        expect(response.status).toBe(200)
        expect(response.body).toBeTruthy()
        const errors = response.body.errors
        expect(errors).toMatchObject([
          {
            message: 'Not authorized',
            locations: [
              {
                line: 3,
                column: 9
              }
            ],
            path:[ 'users' ]
          }
        ])
        return done()
      }
    )
  })

  it('should be possible to call custom graphql queries', (done) => {
    return request(application)
    .post('/api')
    .send({
      query: `{
        randomNumbers
      }`,
    })
    .set('Accept', 'application/json').end(
      (err, response) => {
        if (err) {
          return done(err)
        }
        expect(response.status).toBe(200)
        expect(response.body).toBeTruthy()
        const data = response.body.data
        expect(data.randomNumbers).toBeTruthy()
        expect(data.randomNumbers.length).toBe(4)
        return done()
      }
    )
  })
  it('should be possible to call custom graphql mutations', (done) => {
    return request(application)
    .post('/api')
    .send({
      query: `
        mutation {
          increaseRandomNumber
        }
      `,
    })
    .set('Accept', 'application/json').end(
      (err, response) => {
        if (err) {
          return done(err)
        }
        expect(response.status).toBe(200)
        expect(response.body).toBeTruthy()
        const data = response.body.data
        expect(data.increaseRandomNumber).toBe(5)
        return done()
      }
    )
  })
})
