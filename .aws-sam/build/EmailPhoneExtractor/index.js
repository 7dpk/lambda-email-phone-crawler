const AWS = require("aws-sdk")
const db = new AWS.DynamoDB.DocumentClient()
const tableName = process.env.DynamodbTableName

AWS.config.update({
  region: 'ap-south-1'
})
const s3 = new AWS.S3()
var uploadParams = {
  Bucket: process.env.S3BucketName,
  Body: '',
  Key: ''
};


exports.handler = async (event, context) => {
  const status = event["statusCode"]
  if (status !== 200) {
    return {
      'statusCode': 400,
      'body': 'first lambda erred!!! plz check if the domain is crawlable'
    }
  }
  const url = event["domain"]
  let res
  try {
    const dbResult = await db.get({
      TableName: tableName, Key: {
        domain: url
      }
    }).promise()
    if (Object.keys(dbResult).length > 0) {
      return {
        'statusCode': 200,
        'body': `emails: ${JSON.stringify(dbResult.Item.emails)}, phones: ${JSON.stringify(dbResult.Item.phones)}`
      }
    }
  } catch (e) {
    return {
      'statusCode': 400,
      'body': `Problem with table ${tableName} error: ${JSON.stringify(e)}`
    }
  }
  try {
    res = (await s3.listObjectsV2({ Bucket: process.env.S3BucketName, Prefix: `${url}/` }).promise()).Contents
  } catch (e) {
    return {
      'statusCode': 400,
      'body': `${JSON.stringify(e)}`
    }
  }
  let emails = new Set()
  let phones = new Set()
  for (r of res) {
    try {

      const objectData = (await s3.getObject({ Bucket: process.env.S3BucketName, Key: r.Key }).promise()).Body.toString('utf-8')
      let email_matches = objectData.match(/\w+@\w+\.[a-z]+/g)
      let phone_matches = objectData.match(/(?<!\d)(\+ ?\d{1,2}[\s\u00A0]?)\(?\d{3}\)?[\s.-\u00A0]?\d{3}[\s.-\u00A0]?\d{4}(?!\d)/g)
      if (email_matches) {
        for (let i of email_matches) {
          emails.add(i)
        }
      }
      if (phone_matches) {
        for (let i of phone_matches) {
          phones.add(i)
        }
      }
    } catch (e) {
      return {
        'statusCode': 400,
        'body': JSON.stringify(e)
      }
    }
  }
  // writing to the database
  try {
    const res = await db.put({
      TableName: tableName, Item: {
        domain: url,
        emails: [...emails],
        phones: [...phones]
      }
    }).promise()
  } catch (e) {
    return {
      'statusCode': 400,
      'body': `can't write to table ${tableName} error: ${JSON.stringify(e)}`
    }
  }
  return {
    'statusCode': 200,
    'body': `emails: ${JSON.stringify([...emails])} \n phones: ${JSON.stringify([...phones])}`
  }
}