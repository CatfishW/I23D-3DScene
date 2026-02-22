const fs = require('fs');
const glbs = fs.readdirSync('./backend/gradio_cache').filter(f => f.endsWith('_textured.glb'));
if (glbs.length > 0) {
  const file = './backend/gradio_cache/' + glbs[glbs.length - 1];
  console.log("Inspecting", file);
  // parse the GLB header and JSON chunk
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) === 0x46546C67) {
    const jsonChunkLen = buf.readUInt32LE(12);
    const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLen);
    const gltf = JSON.parse(jsonStr);
    console.log("Materials:", JSON.stringify(gltf.materials, null, 2));
    console.log("Textures:", JSON.stringify(gltf.textures, null, 2));
    console.log("Images:", JSON.stringify(gltf.images, null, 2));
  }
}
