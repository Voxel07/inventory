import { Client } from 'appwrite';

const client = new Client();
client
    .setEndpoint('http://192.168.0.115/v1')
    .setProject('67a52c90002b79ca0975');

export default client;
