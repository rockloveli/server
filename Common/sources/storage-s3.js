﻿'use strict';var url = require('url');var AWS = require('aws-sdk');var mime = require('mime');var s3urlSigner = require('amazon-s3-url-signer');var utils = require('./utils');var configStorage = require('config').get('storage');var cfgRegion = configStorage.get('region');var cfgEndpoint = configStorage.get('endpoint');var cfgBucketName = configStorage.get('bucketName');var cfgStorageFolderName = configStorage.get('storageFolderName');var cfgAccessKeyId = configStorage.get('accessKeyId');var cfgSecretAccessKey = configStorage.get('secretAccessKey');var cfgUseRequestToGetUrl = configStorage.get('useRequestToGetUrl');var cfgUseSignedUrl = configStorage.get('useSignedUrl');/** * Don't hard-code your credentials! * Export the following environment variables instead: * * export AWS_ACCESS_KEY_ID='AKID' * export AWS_SECRET_ACCESS_KEY='SECRET' */var configS3 = {  region: cfgRegion,  endpoint: cfgEndpoint,  accessKeyId: cfgAccessKeyId,  secretAccessKey: cfgSecretAccessKey};if (configS3.endpoint) {  configS3.sslEnabled = false;  configS3.s3ForcePathStyle = true;}AWS.config.update(configS3);var s3Client = new AWS.S3();if (configS3.endpoint) {  s3Client.endpoint = new AWS.Endpoint(configS3.endpoint);}var cfgEndpointParsed = null;if (cfgEndpoint) {  cfgEndpointParsed = url.parse(cfgEndpoint);}//s3 allow only 1000 per requestvar MAX_DELETE_OBJECTS = 1000;function getFilePath(strPath) {  //todo  return cfgStorageFolderName + '/' + strPath;}function joinListObjects(inputArray, outputArray) {  var length = inputArray.length;  for (var i = 0; i < length; i++) {    outputArray.push(inputArray[i].Key.substring((cfgStorageFolderName + '/').length));  }}function listObjectsExec(output, params, resolve, reject) {  s3Client.listObjects(params, function(err, data) {    if (err) {      reject(err);    } else {      joinListObjects(data.Contents, output);      if (data.IsTruncated) {        params.Marker = data.NextMarker;        listObjectsExec(output, params, resolve, reject);      } else {        resolve(output);      }    }  });}function mapDeleteObjects(currentValue) {  return {Key: currentValue};}function deleteObjectsHelp(aKeys) {  return new Promise(function(resolve, reject) {    //todo Quiet    var params = {Bucket: cfgBucketName, Delete: {Objects: aKeys}};    s3Client.deleteObjects(params, function(err, data) {      if (err) {        reject(err);      } else {        resolve(data);      }    });  });}exports.getObject = function(strPath) {  return new Promise(function(resolve, reject) {    var params = {Bucket: cfgBucketName, Key: getFilePath(strPath)};    s3Client.getObject(params, function(err, data) {      if (err) {        reject(err);      } else {        resolve(data.Body);      }    });  });};exports.putObject = function(strPath, buffer, contentLength) {  return new Promise(function(resolve, reject) {    //todo рассмотреть Expires    var params = {Bucket: cfgBucketName, Key: getFilePath(strPath), Body: buffer,      ContentLength: contentLength, ContentType: mime.lookup(strPath), ContentDisposition : 'attachment;'};    s3Client.putObject(params, function(err, data) {      if (err) {        reject(err);      } else {        resolve(data);      }    });  });};exports.listObjects = function(strPath) {  return new Promise(function(resolve, reject) {    var params = {Bucket: cfgBucketName, Prefix: getFilePath(strPath)};    var output = [];    listObjectsExec(output, params, resolve, reject);  });};exports.deleteObject = function(strPath) {  return new Promise(function(resolve, reject) {    var params = {Bucket: cfgBucketName, Key: getFilePath(strPath)};    s3Client.deleteObject(params, function(err, data) {      if (err) {        reject(err);      } else {        resolve(data);      }    });  });};exports.deleteObjects = function(strPaths) {  return new Promise(function(resolve) {    resolve(strPaths.map(mapDeleteObjects));  }).then(function(aKeys) {      var deletePromises = [];      for (var i = 0; i < aKeys.length; i += MAX_DELETE_OBJECTS) {        deletePromises.push(deleteObjectsHelp(aKeys.slice(i, i + MAX_DELETE_OBJECTS)));      }      return Promise.all(deletePromises);    });};exports.getSignedUrl = function(baseUrl, strPath, optUrlExpires) {  return new Promise(function(resolve, reject) {    if (cfgUseRequestToGetUrl) {      var params = {        Bucket: cfgBucketName, Key: getFilePath(strPath), Expires: optUrlExpires      };      s3Client.getSignedUrl('getObject', params, function(err, data) {        if (err) {          reject(err);        } else {          resolve(utils.changeOnlyOfficeUrl(data, strPath));        }      });    } else {      var host;      if (cfgEndpointParsed &&        (cfgEndpointParsed.hostname == 'localhost' || cfgEndpointParsed.hostname == '127.0.0.1') &&        80 == cfgEndpointParsed.port) {        host = baseUrl + cfgEndpointParsed.path;      } else {        host = cfgEndpoint;      }      if (host && host.length > 0 && '/' != host[host.length - 1]) {        host += '/';      }      if (cfgUseSignedUrl) {        var expires = optUrlExpires || 5;        //todo уйти от parse        var hostParsed = url.parse(host);        var protocol = hostParsed.protocol.substring(0, hostParsed.protocol.length - 1);        var signerOptions = {          host: hostParsed.hostname, port: hostParsed.port,          protocol: protocol, useSubdomain: false        };        var awsUrlSigner = s3urlSigner.urlSigner(cfgAccessKeyId, cfgSecretAccessKey, signerOptions);        var newUrl = awsUrlSigner.getUrl('GET', getFilePath(strPath), cfgBucketName, expires);        resolve(utils.changeOnlyOfficeUrl(newUrl, strPath));      } else {        resolve(host + cfgBucketName + '/' + cfgStorageFolderName + '/' + strPath);      }    }  });};