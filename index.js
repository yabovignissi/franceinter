'use strict';
const axios = require('axios').default;
const { v4: uuidv4 } = require('uuid');
const async = require('async');
let MessageFrancais, messageEnglais, nbSettings, nbdetect;

const ComputerVisionClient = require('@azure/cognitiveservices-computervision').ComputerVisionClient;
const ApiKeyCredentials = require('@azure/ms-rest-js').ApiKeyCredentials;

/**
 * AUTHENTICATE
 */
const key = '6e6f44f9a4184ddabd4b52d0c2ef35f0';
const endpoint = 'https://ima-ges.cognitiveservices.azure.com/';


const translateKey = "06dbd844e25e4bdc943b163620e413f9";
const translateendpoint = "https://api.cognitive.microsofttranslator.com/";
const location = "eastus";

const computerVisionClient = new ComputerVisionClient(
    new ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': key } }), endpoint);
/**
 * END - Authenticate
 */

const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { Buffer } = require('buffer');
const { PassThrough } = require('stream');
const fs = require('fs');


const textToSpeech = async (text, filename, voice) => {
    let key = "95481333820041d28820847cc4edd223"
    let region = "southcentralus"

    return new Promise((resolve, reject) => {

        const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
        speechConfig.speechSynthesisOutputFormat = 5; // mp3

        speechConfig.speechSynthesisVoiceName = voice;
        let audioConfig = sdk.AudioConfig.fromAudioFileOutput(filename);
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

        synthesizer.speakTextAsync(
            text,
            result => {

                const { audioData } = result;

                synthesizer.close();

                if (filename) {

                    // return stream from file
                    const audioFile = fs.createReadStream(filename);
                    resolve(audioFile);

                } else {

                    // return stream from memory
                    const bufferStream = new PassThrough();
                    bufferStream.end(Buffer.from(audioData));
                    resolve(bufferStream);
                }
            },
            error => {
                synthesizer.close();
                reject(error);
            });
    });
};

async function computerVision(imageUrl) {
    return new Promise((resolve,reject)=>{
        let textConfig = fs.readFileSync('./config.json', { encoding: "utf8" })
        const config = JSON.parse(textConfig);
        const X = config.max_people;
        nbSettings = config.max_people;
        const MessageFr = config.message ;
        async.series([
            async function () {
                console.log('-------------------------------------------------');
                console.log('DETECTING PERSON ON IMAGE');

                const tagsURL = imageUrl;
    
                // Analyze URL image
                let result = (await computerVisionClient.analyzeImage(tagsURL, { visualFeatures: ["Tags", "Objects"] }))
                let nb = result.objects.filter(obj => obj.object == "person").length
                nbdetect = nb;
    
                let response = await axios({
                    baseURL: translateendpoint,
                    url: '/translate',
                    method: 'post',
                    headers: {
                        'Ocp-Apim-Subscription-Key': translateKey,

                        'Ocp-Apim-Subscription-Region': location,
                        'Content-type': 'application/json',
                        'X-ClientTraceId': uuidv4().toString()
                    },
                    params: {
                        'api-version': '3.0',
                        'from': 'fr',
                        'to': 'en'
                    },
                    data: [{
                        text: MessageFr
                    }],
                    responseType: 'json'
                });
                const MessageEn = response.data[0].translations[0].text
                MessageFrancais = MessageFr;
                messageEnglais = MessageEn;

                console.log(`Le nombre de personne est  : ${nb} , lancement du traitement : ${nb > X}`);
                if (nb > X) {
                    textToSpeech(`${MessageEn}`, './www/en.mp3', "en-US-GuyNeural").then(() => {
                        textToSpeech(`${MessageFr}`, './www/fr.mp3', "fr-FR-AlainNeural").then(() => {
                            console.log('-------------------------------------------------');
                            console.log('End programme.');
                            resolve();
                        })
                    })
                }else{
                    resolve();
                }
    
    
            },
            function () {
                return new Promise((resolve) => {
                    resolve();
                })
            }
        ], (err) => {
            throw (err);
        });
    })
}
/*App with Express*/

const express = require('express');
const { tryEach } = require('async');
const { error } = require('console');
let app = express()


app.use(express.static('www'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.post("/save", (request, response) => {
    let data = JSON.stringify(request.body, null, 4)
    fs.writeFile('./config.json', data, (err, data) => {
        response.redirect("/");
    })
})

app.post("/traitement", (request, response) => {
    try {
        let { img } = request.body
        if (img != "") {
            computerVision(img).then(() => {
                fs.readFile('./rapport.html', {
                    encoding: 'utf8'
                }, function (err, textContent) {
                    let responseText = textContent.replace("{Message}", `<p>Dans cette image j'ai detecter ${nbdetect} personnes</p>`)
                    responseText = responseText.replace("{Settings}", `
                    <h3 style="text-align: center;">Informations après traitement de l'image  : </h3>
                    <p>Message Fr : ${MessageFrancais} <br/>
                    Message En : ${messageEnglais} <br/>
                    Nombre de personnes max: ${nbSettings} </p>`)
                    responseText = responseText.replace("{image}", `<img src="${img}" width="450px" style="text-align:center"/>`)
                    if(nbdetect> nbSettings){
                        responseText = responseText.replace("{audio}", ` <audio id="myAudioFr">
                        <source src="fr.mp3?${Date.now()}" type="audio/mp3">
                        </audio>
                            <audio id="myAudioEn">
                            <source src="en.mp3?${Date.now()}" type="audio/mp3">
                        </audio>
                        <p>Message audio :</p>
                        <div class="audio">
                            <button type="button" onclick="PlayAudioFr()">AudioFr</button>
                            <button type="button" onclick="PlayAudioEn()">AudioEn</button>
                        </div>`)
                    }else {
                        responseText = responseText.replace("{audio}", ``)
                    }
                    response.send(responseText);
                })
            })

        } else {
            fs.readFile('./rapport.html', {
                encoding: 'utf8'
            }, function (textContent) {
                let responseText = textContent.replace("{Message}", "<p>Aucune image n'as ete trouvé, impossible de realiser le traitement</p>")
                responseText = responseText.replace("{Settings}", ``)
                responseText = responseText.replace("{image}", ``)
                responseText = responseText.replace("{audio}", ``)

                response.send(responseText);
            })
        }
    } catch (error) {
        console.log(error.message)
        response.redirect("/");
    }
})

app.get("/settings", (request, response) => {
    fs.readFile('./config.json', 'utf8', (err, data) => {
        if (err) {
            response.json(err);
            return;
        }
        let json = JSON.parse(data)
        response.json(json);
    });

})
app.listen(8989, () => {
    console.log('server started on 8989')
})
