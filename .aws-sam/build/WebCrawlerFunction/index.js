const axios = require("axios")
const cheerio = require("cheerio")
const AWS = require("aws-sdk")
const valid = require("is-valid-domain")

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
  const url = event["request"]["domain"]
  // check if the domain has already been fetched
  if (!valid(url)) {
    return {
      'statusCode': 400,
      'body': `Invalid domain ${url} provided plz provide a valid domain name`
    }
  }
  try {
    const found = await s3.listObjectsV2({ Bucket: uploadParams.Bucket, Prefix: `${url}/`, MaxKeys: 1 }).promise()
    if (found.Contents.length > 0) {
      return {
        'statusCode': 200,
        'domain': url,
        'body': `domain has already been fetched ${JSON.stringify(found)}`
      }
    }
  } catch (e) {
    return {
      'statusCode': 400,
      'body': `Bucket not found and some error occured ${JSON.stringify(e)}`
    }
  }
  const data = await (await axios.get(`https://${url}`)).data
  const $ = cheerio.load(data)
  const links = new Set()
  links.add(`https://${url}`)
  let s3data
  $('nav a').each((i, e) => {
    links.add($(e).attr('href'))
  })
  for (let i of links) {

    try {
      let response = await (await axios.get(i)).data

      let path = i.split('/').slice(-1)[0]
      if (path.search(url) != -1) {
        let filepath = `${url}/.html`
        uploadParams.Key = filepath
        uploadParams.Body = response
        try {
          s3data = await s3.putObject(uploadParams).promise()
          console.log(s3data)
        } catch (e) {
          return {
            'statusCode': 400,
            'body': JSON.stringify(e)
          }
        }
      } else {
        let filepath = `${url}/${path}.html`
        uploadParams.Key = filepath
        uploadParams.Body = response
        try {
          s3data = await s3.putObject(uploadParams).promise()
          console.log(s3data)
        } catch (e) {
          return {
            'statusCode': 400,
            'body': JSON.stringify(e)
          }
        }
      }
    } catch (e) {
      return {
        'statusCode': 400,
        'body': JSON.stringify(e)
      }
    }

  }

  return {
    'statusCode': 200,
    'domain': url,
    'body': `${JSON.stringify(links)} and ${JSON.stringify(uploadParams.Bucket)}`
  }
}