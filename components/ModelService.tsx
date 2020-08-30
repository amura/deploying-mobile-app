import * as tf from '@tensorflow/tfjs';
import * as FileSystem from 'expo-file-system'
import { fetch ,asyncStorageIO,bundleResourceIO,decodeJpeg} from '@tensorflow/tfjs-react-native'
import * as jpeg from 'jpeg-js'
import {Image, ImageSourcePropType} from 'react-native';

export interface ModelPrediction {
  className:string;
  probability:number;

}

const imageToTensor = (imgB64:string)=> {
  const imgBuffer = tf.util.encodeString(imgB64, 'base64').buffer;
  const rawImageData = new Uint8Array(imgBuffer)  
  
  const TO_UINT8ARRAY = true
    const { width, height, data } = jpeg.decode(rawImageData, TO_UINT8ARRAY)
    // Drop the alpha channel info for mobilenet
    const buffer = new Uint8Array(width * height * 3)
    let offset = 0 // offset into original data
    for (let i = 0; i < buffer.length; i += 3) {
      buffer[i] = data[offset]
      buffer[i + 1] = data[offset + 1]
      buffer[i + 2] = data[offset + 2]

      offset += 4
    }

    return tf.tensor3d(buffer, [height, width, 3])
}


const  fetchImage = async (image:ImageSourcePropType) => {
  const imageAssetPath = Image.resolveAssetSource(image)
  console.log(imageAssetPath.uri);

  const imgB64:string = await FileSystem.readAsStringAsync(imageAssetPath.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  
  return imgB64;
}
const preprocessImage = (imageTensor:tf.Tensor3D,image_size:number) =>{
    const preProcessedImage = tf.tidy(() => {
        const b = tf.scalar(127.5);

        let res = tf.div(imageTensor,b);
        
        res = tf.sub( res, 1) ;

        // https://github.com/keras-team/keras-applications/blob/master/keras_applications/imagenet_utils.py#L43

        let normalized = res;            
        const alignCorners = true;

        const resized =
          normalized.resizeBilinear([image_size, image_size], alignCorners)
        const batchedImage = resized.expandDims();
        return batchedImage;
      })
      return preProcessedImage;          
}

const decodePredictions = (predictions:tf.Tensor, classes:String[],topK=3) =>{
  const {values, indices} = predictions.topk(topK);
  const topKValues = values.dataSync();
  const topKIndices = indices.dataSync();

  const topClassesAndProbs:ModelPrediction[] = [];
  for (let i = 0; i < topKIndices.length; i++) {
    topClassesAndProbs.push({
      className: classes[topKIndices[i]],
      probability: topKValues[i]
    } as ModelPrediction);
  }
  return topClassesAndProbs;
}


export class ModelService {

    private model:tf.GraphModel;
    private model_classes: String[];
    private IMAGE_SIZE = 224;
    constructor(image_size:number=224,model:tf.GraphModel,model_classes: String[] ){
        this.IMAGE_SIZE=image_size;
        this.model = model;
        this.model_classes=model_classes;
    }


    static async create(image_size=224) {
      
      const modelJSON = require('../assets/model_tfjs/model.json');
      const modelWeights = require('../assets/model_tfjs/group1-shard1of1.bin');
      const model = await tf.loadGraphModel(bundleResourceIO(modelJSON, modelWeights));
      const model_classes = require("../assets/model_tfjs/classes.json")


      return new ModelService(image_size,model,model_classes);


    }

    async intialize(){
        await tf.ready(); 
        this.model.predict(tf.zeros([1, this.IMAGE_SIZE, this.IMAGE_SIZE, 3]));
    }

    async classifyImage(image:ImageSourcePropType):Promise<ModelPrediction[]>{ 
      let mobilenetClasses:ModelPrediction[]=[];
      try {
          console.log(`Classifying Image: Start `)
          const timeStart = new Date().getTime()
          
          let imgB64:string = await fetchImage(image); 

          
          
          tf.tidy(()=>{
            console.log(`Fetching Image: Start `)
          
            const imageTensor:tf.Tensor3D = imageToTensor(imgB64);
            imgB64 =''; 
            
            console.log(`Fetching Image: Done `)
            const timeLoadDone = new Date().getTime()
      
            console.log("Preprocessing image: Start")
            
            const preProcessedImage = preprocessImage(imageTensor,this.IMAGE_SIZE);
      
            console.log("Preprocessing image: Done")
            const timePrepocessDone = new Date().getTime()
      
            console.log("Prediction: Start")
            const predictions:tf.Tensor = this.model.predict(preProcessedImage) as tf.Tensor;
            
            console.log(predictions);
            console.log("Prediction: Done")
            const timePredictionDone = new Date().getTime()
      
            console.log("Post Processing: Start")
      
            // post processing
            mobilenetClasses  = decodePredictions(predictions,this.model_classes,3);
            
            
            //tf.dispose(imageTensor);
            //tf.dispose(preProcessedImage);
            //tf.dispose(predictions);

            console.log("Post Processing: Done")

            const timeEnd = new Date().getTime()
    
            console.log(`Time Total: ${timeEnd-timeStart} \n
            Time Loading: ${timeLoadDone-timeStart} \n
            Time PreProcess: ${timePrepocessDone-timeStart} \n
            Time Prediction: ${timePredictionDone-timeStart} \n
            
            `)
          });
          
          
          console.log(`Classifying Image: End `);

          console.log(mobilenetClasses)
          console.log(typeof(mobilenetClasses))
          return mobilenetClasses
          
      } catch (error) {
          console.log('Exception Error: ', error)
      }
      return mobilenetClasses;
    }
}
