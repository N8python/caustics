import * as THREE from 'https://cdn.skypack.dev/three@0.142.0';
import { EffectComposer } from 'https://unpkg.com/three@0.142.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.142.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://unpkg.com/three@0.142.0/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'https://unpkg.com/three@0.142.0/examples/jsm/postprocessing/SMAAPass.js';
import { GammaCorrectionShader } from 'https://unpkg.com/three@0.142.0/examples/jsm/shaders/GammaCorrectionShader.js';
import { EffectShader } from "./EffectShader.js";
import { OrbitControls } from 'https://unpkg.com/three@0.142.0/examples/jsm/controls/OrbitControls.js';
import { FullScreenQuad } from 'https://unpkg.com/three@0.142.0/examples/jsm/postprocessing/Pass.js';
import { AssetManager } from './AssetManager.js';
import { GLTFLoader } from "https://unpkg.com/three@0.142.0/examples/jsm/loaders/GLTFLoader.js"
import { VerticalBlurShader } from "https://unpkg.com/three@0.142.0/examples/jsm/shaders/VerticalBlurShader.js";
import { HorizontalBlurShader } from "https://unpkg.com/three@0.142.0/examples/jsm/shaders/HorizontalBlurShader.js";
import {
    MeshBVH,
    MeshBVHVisualizer,
    MeshBVHUniformStruct,
    FloatVertexAttributeTexture,
    shaderStructs,
    shaderIntersectFunction,
    SAH
} from 'https://unpkg.com/three-mesh-bvh@0.5.10/build/index.module.js';
import { Stats } from "./stats.js";
import { RectAreaLightUniformsLib } from "https://unpkg.com/three@0.142.0/examples/jsm/lights/RectAreaLightUniformsLib.js"
import { RectAreaLightHelper } from "https://unpkg.com/three@0.142.0/examples/jsm/helpers/RectAreaLightHelper.js"
import { GUI } from 'https://unpkg.com/three@0.142.0/examples/jsm/libs/lil-gui.module.min.js';
async function main() {
    // Setup basic renderer, controls, and profiler
    const clientWidth = window.innerWidth * 0.99;
    const clientHeight = window.innerHeight * 0.98;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, clientWidth / clientHeight, 0.1, 1000);
    camera.position.set(50, 75, 50);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(clientWidth, clientHeight);
    document.body.appendChild(renderer.domElement);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 25, 0);
    const stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);
    RectAreaLightUniformsLib.init();
    // Setup scene
    // Skybox
    const environment = await new THREE.CubeTextureLoader().loadAsync([
        "skybox/Box_Right.bmp",
        "skybox/Box_Left.bmp",
        "skybox/Box_Top.bmp",
        "skybox/Box_Bottom.bmp",
        "skybox/Box_Front.bmp",
        "skybox/Box_Back.bmp"
    ]);
    environment.encoding = THREE.sRGBEncoding;
    //scene.background = environment;
    // Lighting
    const ambientLight = new THREE.AmbientLight(new THREE.Color(1.0, 1.0, 1.0), 0.25);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.bias = -0.001;
    directionalLight.shadow.blurSamples = 8;
    directionalLight.shadow.radius = 4;
    scene.add(directionalLight);
    scene.add(directionalLight.target);
    const areaLight = new THREE.RectAreaLight(0xffffff, 1, 0, 0);
    const rectLightHelper = new RectAreaLightHelper(areaLight);
    areaLight.add(rectLightHelper);
    scene.add(areaLight);
    const helper = new THREE.CameraHelper(directionalLight.shadow.camera);
    scene.add(helper);
    let lightAngle = Math.PI / 4; //new THREE.Vector3(30, 40, 20).normalize();
    let lightRadius = 40;
    // directionalLight.position.set(30, 40, 20);
    let causticSize = 40;
    const ior = 1.1;
    let causticNeedsUpdate = true;
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(1.0, 1.0, 1.0),
        metalness: 0.0,
        roughness: 0.0,
        transmission: 1.0,
        ior,
        thickness: 10.0,
        roughness: 0.1
    });
    const effectController = {
        ior: ior,
        bounces: 8,
        causticIntensity: 0.05,
        worldRadius: 0.3125,
        bunnyRotation: 0.0,
        lightAngle: lightAngle,
        lightRadius: lightRadius
    }
    const gui = new GUI();
    gui.add(effectController, "ior", 1.0, 2.0, 0.01).onChange((value) => {
        glassMat.ior = value;
        console.log(causticsQuad.material.uniforms);
        causticsQuad.material.uniforms.ior.value = value;
        causticNeedsUpdate = true;
    });
    gui.add(effectController, "bounces", 0, 32, 1).onChange((value) => {
        causticsQuad.material.uniforms.bounces.value = value;
        causticNeedsUpdate = true;
    });
    gui.add(effectController, "causticIntensity", 0, 1, 0.01).onChange((value) => {
        causticsQuad.material.uniforms.causticIntensity.value = value;
        causticNeedsUpdate = true;
    });
    gui.add(effectController, "worldRadius", 0.01, 1, 0.01).onChange((value) => {
        causticsQuad.material.uniforms.worldRadius.value = value;
        causticNeedsUpdate = true;
    });
    gui.add(effectController, "bunnyRotation", 0, 2 * Math.PI, 0.01).onChange((value) => {
        bunny.rotation.y = value;
        causticNeedsUpdate = true;
    });
    /*  gui.add(effectController, "lightAngle", 0, 2 * Math.PI, 0.01).onChange((value) => {
          directionalLight.position.set(lightRadius * Math.sin(value), lightRadius, lightRadius * Math.cos(value));
          areaLight.position.copy(directionalLight.position);
          areaLight.lookAt(0, 0, 0);
          causticNeedsUpdate = true;
      });
      gui.add(effectController, "lightRadius", 0, 100, 0.01).onChange((value) => {
          directionalLight.position.set(value * Math.sin(lightAngle), value, value * Math.cos(lightAngle));
          areaLight.position.copy(directionalLight.position);
          areaLight.lookAt(0, 0, 0);
          causticNeedsUpdate = true;
      });*/

    // Objects
    const box = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: new THREE.Color(1.0, 0.0, 0.0) }));
    box.castShadow = true;
    box.receiveShadow = true;
    box.position.y = 5.01;
    //scene.add(box);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(6.25, 32, 32), glassMat);
    sphere.position.y = 7.5;
    sphere.position.x = 25;
    sphere.position.z = 25;
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    //scene.add(sphere);
    const torusKnot = new THREE.Mesh(new THREE.TorusKnotGeometry(5, 1.5, 200, 32), glassMat);
    torusKnot.position.y = 10;
    torusKnot.position.x = -25;
    torusKnot.position.z = -25;
    torusKnot.castShadow = true;
    torusKnot.receiveShadow = true;
    // scene.add(torusKnot);
    const bunny = new THREE.Mesh((await new GLTFLoader().loadAsync("bunny.glb")).scene.children[0].children[0].geometry.scale(0.075, 0.075, 0.075).translate(0, 18, 0)
        /*new THREE.SphereGeometry(5, 32, 32).translate(0, 5, 0)*/
        , glassMat);
    bunny.castShadow = true;
    bunny.frustumCulled = false;
    scene.add(bunny);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2)), new THREE.MeshStandardMaterial({
        side: THREE.DoubleSide
    }));
    ground.castShadow = true;
    const lightDir = new THREE.Vector3(0.5, 0.707, 0.5);
    const updateFromMesh = () => {
            const bunnyBox = new THREE.Box3().setFromObject(bunny, true);
            // scene.add(new THREE.Box3Helper(bunnyBox, 0xffff00));
            const lightPlane = new THREE.Plane(lightDir.clone().normalize().multiplyScalar(-1), 0);
            let bunnyBoxVertices = [];
            bunnyBoxVertices.push(new THREE.Vector3(bunnyBox.min.x, bunnyBox.min.y, bunnyBox.min.z));
            bunnyBoxVertices.push(new THREE.Vector3(bunnyBox.min.x, bunnyBox.min.y, bunnyBox.max.z));
            bunnyBoxVertices.push(new THREE.Vector3(bunnyBox.min.x, bunnyBox.max.y, bunnyBox.min.z));
            bunnyBoxVertices.push(new THREE.Vector3(bunnyBox.min.x, bunnyBox.max.y, bunnyBox.max.z));
            bunnyBoxVertices.push(new THREE.Vector3(bunnyBox.max.x, bunnyBox.min.y, bunnyBox.min.z));
            bunnyBoxVertices.push(new THREE.Vector3(bunnyBox.max.x, bunnyBox.min.y, bunnyBox.max.z));
            bunnyBoxVertices.push(new THREE.Vector3(bunnyBox.max.x, bunnyBox.max.y, bunnyBox.min.z));
            bunnyBoxVertices.push(new THREE.Vector3(bunnyBox.max.x, bunnyBox.max.y, bunnyBox.max.z));
            const worldVerts = bunnyBoxVertices.map(v => v.clone());
            const meshCenter = bunnyBox.getCenter(new THREE.Vector3());
            bunnyBoxVertices = bunnyBoxVertices.map((v) => v.clone().sub(meshCenter));
            const projectedVerts = bunnyBoxVertices.map((v) => lightPlane.projectPoint(v, new THREE.Vector3()));
            const centralVert = projectedVerts.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(projectedVerts.length);
            const radius = projectedVerts.map((v) => v.distanceTo(centralVert)).reduce((a, b) => Math.max(a, b));
            const dirLength = bunnyBoxVertices.map(x => x.dot(lightDir)).reduce((a, b) => Math.max(a, b));

            causticSize = radius;
            // Shadows
            directionalLight.position.copy(lightDir.clone().multiplyScalar(dirLength).add(meshCenter));
            directionalLight.target.position.copy(meshCenter);
            const dirMatrix = new THREE.Matrix4().lookAt(directionalLight.position, directionalLight.target.position, new THREE.Vector3(0, 1, 0))
            directionalLight.shadow.camera.left = -causticSize;
            directionalLight.shadow.camera.right = causticSize;
            directionalLight.shadow.camera.top = causticSize;
            directionalLight.shadow.camera.bottom = -causticSize;
            const yOffset = new THREE.Vector3(0, causticSize, 0).applyMatrix4(dirMatrix);
            const yTime = (directionalLight.position.y + yOffset.y /*+ causticSize * 2.0 * (1 - lightDir.y)*/ ) / lightDir.y;
            directionalLight.shadow.camera.near = 0.1;
            directionalLight.shadow.camera.far = yTime;
            directionalLight.shadow.camera.updateProjectionMatrix();
            directionalLight.updateMatrixWorld();
            helper.update();
            areaLight.height = causticSize * 2.0;
            areaLight.width = causticSize * 2.0;
            areaLight.position.copy(directionalLight.position);
            areaLight.lookAt(directionalLight.target.position);
            // Now find size of ground plane
            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const groundProjectedCoords = worldVerts.map(v => v.clone().add(lightDir.clone().multiplyScalar(-v.y / lightDir.y)));
            /*    worldVerts.forEach(v => {
                    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.0, 1.0, 0.0) }));
                    sphere.position.copy(v);
                    scene.add(sphere);
                })*/
            const centerPos = groundProjectedCoords.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(groundProjectedCoords.length);
            const maxSize = 2 * groundProjectedCoords.map(v => Math.hypot(v.x - centerPos.x, v.z - centerPos.z)).reduce((a, b) => Math.max(a, b));
            ground.scale.set(maxSize, maxSize, maxSize);
            ground.position.copy(centerPos);
        }
        // Convert projectedVerts to uv coords

    const bunnyTree = new MeshBVH(bunny.geometry, { lazyGeneration: false, strategy: SAH });
    const causticsRez = 2048;
    // Build postprocessing stack
    // Render Targets
    const defaultTexture = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter
    });
    defaultTexture.depthTexture = new THREE.DepthTexture(clientWidth, clientHeight, THREE.FloatType);

    const normalTexture = new THREE.WebGLRenderTarget(causticsRez, causticsRez, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
    });
    normalTexture.depthTexture = new THREE.DepthTexture(causticsRez, causticsRez, THREE.FloatType);
    const normalTextureBack = new THREE.WebGLRenderTarget(causticsRez, causticsRez, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter
    });
    normalTextureBack.depthTexture = new THREE.DepthTexture(causticsRez, causticsRez, THREE.FloatType);
    // Post Effects
    const composer = new EffectComposer(renderer);
    const smaaPass = new SMAAPass(clientWidth, clientHeight);
    const effectPass = new ShaderPass(EffectShader);
    composer.addPass(effectPass);
    composer.addPass(new ShaderPass(GammaCorrectionShader));
    composer.addPass(smaaPass);
    // Write a shader material to output the world normal of a mesh
    const normalMat = new THREE.MeshNormalMaterial();
    normalMat.onBeforeCompile = (shader) => {
        shader.uniforms.viewMatrix = { value: directionalLight.shadow.camera.matrixWorldInverse };
        shader.fragmentShader = `
        vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
            // dir can be either a direction vector or a normal vector
            // upper-left 3x3 of matrix is assumed to be orthogonal
            return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
        }
        ` + shader.fragmentShader.replace(
            "#include <normal_fragment_maps>",
            `
            #include <normal_fragment_maps>
             normal = inverseTransformDirection( normal, viewMatrix );
            `);
    };
    const normalMatBack = new THREE.MeshNormalMaterial({
        side: THREE.BackSide
    });
    normalMatBack.onBeforeCompile = (shader) => {
        shader.uniforms.viewMatrix = { value: directionalLight.shadow.camera.matrixWorldInverse };
        shader.fragmentShader = `
        vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
            // dir can be either a direction vector or a normal vector
            // upper-left 3x3 of matrix is assumed to be orthogonal
            return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
        }
        ` + shader.fragmentShader.replace(
            "#include <normal_fragment_maps>",
            `
            #include <normal_fragment_maps>
             normal = inverseTransformDirection( normal, viewMatrix );
            `);
    };
    const causticsTarget = new THREE.WebGLRenderTarget(causticsRez, causticsRez, {
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        generateMipmaps: true
    });
    const causticsTarget2 = new THREE.WebGLRenderTarget(causticsRez, causticsRez, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
    });
    directionalLight.shadow.camera.updateWorldMatrix();
    // Render caustics with FullScreenQuad
    const causticsQuad = new FullScreenQuad(new THREE.ShaderMaterial({
        uniforms: {
            viewMatrixLight: { value: directionalLight.shadow.camera.matrixWorldInverse },
            projectionMatrixLight: { value: directionalLight.shadow.camera.projectionMatrix },
            cameraMatrixWorld: { value: directionalLight.shadow.camera.matrixWorld },
            cameraProjectionMatrixInv: { value: directionalLight.shadow.camera.projectionMatrixInverse },
            normalTexture: { value: normalTexture.texture },
            depthTexture: { value: normalTexture.depthTexture },
            normalTextureBack: { value: normalTextureBack.texture },
            depthTextureBack: { value: normalTextureBack.depthTexture },
            lightDir: { value: directionalLight.position.clone().normalize().multiplyScalar(-1) },
            near: { value: directionalLight.shadow.camera.near },
            far: { value: directionalLight.shadow.camera.far },
            lightPlaneConstant: { value: 0 },
            lightPlaneNormal: { value: new THREE.Vector3(0, 1, 0) },
            time: { value: 0 },
            bvh: { value: new MeshBVHUniformStruct() },
            modelMatrix: { value: bunny.matrixWorld },
            normalAttribute: { value: new FloatVertexAttributeTexture() },
            worldRadius: {
                value: effectController.worldRadius
            },
            ior: { value: ior },
            bounces: { value: 32 },
            causticsRez: { value: causticsRez },
            causticSize: { value: causticSize },
            causticIntensity: { value: 0.05 }
        },
        vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
        `,
        fragmentShader: /* glsl */ `
        uniform mat4 viewMatrixLight;
        uniform mat4 projectionMatrixLight;
        uniform mat4 cameraMatrixWorld;
        uniform mat4 cameraProjectionMatrixInv;
        uniform mat4 modelMatrix;
        uniform vec3 lightDir;
        uniform vec3 lightPlaneNormal;
        uniform float lightPlaneConstant;
        uniform float near;
        uniform float far;
        uniform float time;
        uniform float worldRadius;
        uniform float causticsRez;
        uniform float causticSize;
        uniform float causticIntensity;
        uniform float ior;
        precision highp isampler2D;
        precision highp usampler2D;
        ${ shaderStructs }
        ${ shaderIntersectFunction }
        uniform BVH bvh;
        uniform sampler2D normalAttribute;
        uniform sampler2D normalTexture;
        uniform sampler2D depthTexture;
        uniform sampler2D normalTextureBack;
        uniform sampler2D depthTextureBack;
        uniform float bounces;
        varying vec2 vUv;
        vec3 WorldPosFromDepth(float depth, vec2 coord) {
            float z = depth * 2.0 - 1.0;
            vec4 clipSpacePosition = vec4(coord * 2.0 - 1.0, z, 1.0);
            vec4 viewSpacePosition = cameraProjectionMatrixInv * clipSpacePosition;
            // Perspective division
            viewSpacePosition /= viewSpacePosition.w;
            vec4 worldSpacePosition = cameraMatrixWorld * viewSpacePosition;
            return worldSpacePosition.xyz;
          }                  
        float sdPlane( vec3 p, vec3 n, float h )
        {
          // n must be normalized
          return dot(p,n) + h;
        }
        float planeIntersect( vec3 ro, vec3 rd, vec4 p )
{
    return -(dot(ro,p.xyz)+p.w)/dot(rd,p.xyz);
}
vec3 totalInternalReflection(vec3 ro, vec3 rd, vec3 pos, vec3 normal, float ior, mat4 modelMatrixInverse, out vec3 rayOrigin, out vec3 rayDirection) {
    rayOrigin = ro;
    rayDirection = rd;
    rayDirection = refract(rayDirection, normal, 1.0 / ior);
    rayOrigin = pos + rayDirection * 0.1;
    rayOrigin = (modelMatrixInverse * vec4(rayOrigin, 1.0)).xyz;
    rayDirection = normalize((modelMatrixInverse * vec4(rayDirection, 0.0)).xyz);
   for(float i = 0.0; i < bounces; i++) {
        uvec4 faceIndices = uvec4( 0u );
        vec3 faceNormal = vec3( 0.0, 0.0, 1.0 );
        vec3 barycoord = vec3( 0.0 );
        float side = 1.0;
        float dist = 0.0;
        bvhIntersectFirstHit( bvh, rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist );
        faceNormal = textureSampleBarycoord(
            normalAttribute,
            barycoord,
            faceIndices.xyz
        ).xyz * side;
        vec3 hitPos = rayOrigin + rayDirection * max(dist - 0.001, 0.0);
        vec3 tempDir = refract(rayDirection, faceNormal, ior);
        if (length(tempDir) != 0.0) {
            rayOrigin = hitPos + rayDirection * 0.1;
            rayDirection = tempDir;
            break;
        }
        rayDirection = reflect(rayDirection, faceNormal);
        rayOrigin = hitPos + rayDirection * 0.01;
    }
    rayOrigin = (modelMatrix * vec4(rayOrigin, 1.0)).xyz;
    rayDirection = normalize((modelMatrix * vec4(rayDirection, 0.0)).xyz);
    return rayDirection;
}
        void main() {
            // Each sample consists of random offset in the x and y direction
            mat4 modelMatrixInverse = inverse(modelMatrix);
            float caustic = 0.0;
            float causticTexelSize = (1.0 / causticsRez) * causticSize * 2.0;
            float texelsNeeded = worldRadius / causticTexelSize;
            float sampleRadius = texelsNeeded / causticsRez;
            if (texture2D(depthTexture, vUv).x == 1.0) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }
               vec2 offset1 = vec2(-0.5, -0.5);//vec2(rand() - 0.5, rand() - 0.5);
                vec2 offset2 = vec2(-0.5, 0.5);//vec2(rand() - 0.5, rand() - 0.5);
                vec2 offset3 = vec2(0.5, 0.5);//vec2(rand() - 0.5, rand() - 0.5);
                vec2 offset4 = vec2(0.5, -0.5);//vec2(rand() - 0.5, rand() - 0.5);
                vec2 uv1 = vUv + offset1 * sampleRadius;
                vec2 uv2 = vUv + offset2 * sampleRadius;
                vec2 uv3 = vUv + offset3 * sampleRadius;
                vec2 uv4 = vUv + offset4 * sampleRadius;
                vec3 normal1 = texture2D(normalTexture, uv1, -10.0).rgb * 2.0 - 1.0;
                vec3 normal2 = texture2D(normalTexture, uv2, -10.0).rgb * 2.0 - 1.0;
                vec3 normal3 = texture2D(normalTexture, uv3, -10.0).rgb * 2.0 - 1.0;
                vec3 normal4 = texture2D(normalTexture, uv4, -10.0).rgb * 2.0 - 1.0;
                float depth1 = texture2D(depthTexture, uv1, -10.0).x;
                float depth2 = texture2D(depthTexture, uv2, -10.0).x;
                float depth3 = texture2D(depthTexture, uv3, -10.0).x;
                float depth4 = texture2D(depthTexture, uv4, -10.0).x;
                // Sanity check the depths
                if (depth1 == 1.0 || depth2 == 1.0 || depth3 == 1.0 || depth4 == 1.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }
                vec3 pos1 = WorldPosFromDepth(depth1, uv1);
                vec3 pos2 = WorldPosFromDepth(depth2, uv2);
                vec3 pos3 = WorldPosFromDepth(depth3, uv3);
                vec3 pos4 = WorldPosFromDepth(depth4, uv4);
                vec3 originPos1 = WorldPosFromDepth(0.0, uv1);
                vec3 originPos2 = WorldPosFromDepth(0.0, uv2);
                vec3 originPos3 = WorldPosFromDepth(0.0, uv3);
                vec3 originPos4 = WorldPosFromDepth(0.0, uv4);
                vec3 endPos1, endPos2, endPos3, endPos4;
                vec3 endDir1, endDir2, endDir3, endDir4;
                totalInternalReflection(originPos1, lightDir, pos1, normal1, ior, modelMatrixInverse, endPos1, endDir1);
                totalInternalReflection(originPos2, lightDir, pos2, normal2, ior, modelMatrixInverse, endPos2, endDir2);
                totalInternalReflection(originPos3, lightDir, pos3, normal3, ior, modelMatrixInverse, endPos3, endDir3);
                totalInternalReflection(originPos4, lightDir, pos4, normal4, ior, modelMatrixInverse, endPos4, endDir4);
                float lightPosArea = length(cross(originPos2 - originPos1, originPos3 - originPos1)) + length(cross(originPos3 - originPos1, originPos4 - originPos1));
                float t1 = planeIntersect(endPos1, endDir1, vec4(0.0, 1.0, 0.0, 0.0));
                float t2 = planeIntersect(endPos2, endDir2, vec4(0.0, 1.0, 0.0, 0.0));
                float t3 = planeIntersect(endPos3, endDir3, vec4(0.0, 1.0, 0.0, 0.0));
                float t4 = planeIntersect(endPos4, endDir4, vec4(0.0, 1.0, 0.0, 0.0));
                vec3 finalPos1 = endPos1 + endDir1 * t1;
                vec3 finalPos2 = endPos2 + endDir2 * t2;
                vec3 finalPos3 = endPos3 + endDir3 * t3;
                vec3 finalPos4 = endPos4 + endDir4 * t4;
                float finalArea = length(cross(finalPos2 - finalPos1, finalPos3 - finalPos1)) + length(cross(finalPos3 - finalPos1, finalPos4 - finalPos1));
                //gl_FragColor = vec4(lightPosArea, 0.0, 0.0, 1.0);
                //return;
                caustic += causticIntensity * (lightPosArea / finalArea);
            // Calculate the area of the triangle in light spaces
            gl_FragColor = vec4(vec3(max(caustic, 0.0)), 1.0);
        }
        `
    }));


    /*  causticsMesh.matrixAutoUpdate = false;
      causticsMesh.position.y += 0.01;
      scene.add(causticsMesh);*/

    // ground.receiveShadow = true;
    // Apply caustics in material.onBeforeCompile
    ground.material.onBeforeCompile = (shader) => {
        shader.uniforms["causticsTexture"] = {
            value: causticsTarget.texture
        }
        shader.uniforms["causticsDepthTexture"] = {
            value: normalTexture.depthTexture
        }
        shader.uniforms["lightProjMatrix"] = {
            value: directionalLight.shadow.camera.projectionMatrix
        }
        shader.uniforms["lightViewMatrix"] = {
            value: directionalLight.shadow.camera.matrixWorldInverse
        }
        shader.uniforms.shadowTex = { value: null };
        setTimeout(() => {
            shader.uniforms.shadowTex = { value: directionalLight.shadow.map.texture };
        });
        shader.vertexShader = shader.vertexShader.replace("#ifdef USE_TRANSMISSION", "").replace("#ifdef USE_TRANSMISSION", "");
        shader.vertexShader = shader.vertexShader.replace("#endif", "").replace("#endif", "");
        shader.vertexShader = shader.vertexShader.replace("#include <worldpos_vertex>", `
            vec4 worldPosition = vec4( transformed, 1.0 );
            #ifdef USE_INSTANCING
                worldPosition = instanceMatrix * worldPosition;
            #endif
            worldPosition = modelMatrix * worldPosition;    
            `);
        shader.fragmentShader = `
        varying vec3 vWorldPosition;
        uniform sampler2D causticsTexture;
        uniform sampler2D causticsDepthTexture;
        uniform sampler2D shadowTex;
        uniform mat4 lightProjMatrix;
        uniform mat4 lightViewMatrix;
        ` + shader.fragmentShader.replace("#include <normal_fragment_maps>", `
        #include <normal_fragment_maps>
        // Apply caustics
        vec4 lightSpacePos = lightProjMatrix * lightViewMatrix * vec4(vWorldPosition, 1.0);
        lightSpacePos.xyz /= lightSpacePos.w;
        lightSpacePos.xyz = lightSpacePos.xyz * 0.5 + 0.5;
        vec4 caustics = texture2D(causticsTexture, lightSpacePos.xy);
        vec4 causticsDepth = texture2D(causticsDepthTexture, lightSpacePos.xy);
        float depth = causticsDepth.x;
        totalEmissiveRadiance += caustics.rgb * (1.0 - VSMShadow(shadowTex, lightSpacePos.xy, lightSpacePos.z));
        `);

    }
    scene.add(ground);

    const hblur = new FullScreenQuad(new THREE.ShaderMaterial(HorizontalBlurShader));
    const vblur = new FullScreenQuad(new THREE.ShaderMaterial(VerticalBlurShader));
    hblur.material.uniforms['h'] = { value: 1.0 / causticsRez };
    vblur.material.uniforms['v'] = { value: 1.0 / causticsRez };

    function animate() {
        updateFromMesh();
        if (causticNeedsUpdate) {
            console.time();
            const dirLightNearPlane = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(directionalLight.shadow.camera.projectionMatrix, directionalLight.shadow.camera.matrixWorldInverse)).planes[4];
            causticsQuad.material.uniforms["lightPlaneConstant"].value = dirLightNearPlane.constant;
            causticsQuad.material.uniforms["lightPlaneNormal"].value = dirLightNearPlane.normal;
            causticsQuad.material.uniforms["time"].value = performance.now() / 1000;
            causticsQuad.material.uniforms.lightDir.value = directionalLight.position.clone().normalize().multiplyScalar(-1);
            causticsQuad.material.uniforms.bvh.value.updateFrom(bunnyTree);
            causticsQuad.material.uniforms.normalAttribute.value.updateFrom(bunny.geometry.attributes.normal);
            helper.visible = false;
            ground.visible = false;
            // causticsMesh.matrix.copy(directionalLight.shadow.camera.matrixWorld);
            //  causticsMesh.visible = false;
            scene.overrideMaterial = normalMat;
            renderer.setRenderTarget(normalTexture);
            renderer.clear();
            renderer.render(scene, directionalLight.shadow.camera);
            scene.overrideMaterial = normalMatBack;
            renderer.setRenderTarget(normalTextureBack);
            renderer.clear();
            renderer.render(scene, directionalLight.shadow.camera);
            scene.overrideMaterial = null;
            renderer.setRenderTarget(causticsTarget);
            renderer.clear();
            causticsQuad.render(renderer);
            /*  renderer.setRenderTarget(causticsTarget2);
              renderer.clear();
              hblur.material.uniforms["tDiffuse"].value = causticsTarget.texture;
              hblur.render(renderer);
              renderer.setRenderTarget(causticsTarget);
              renderer.clear();
              vblur.material.uniforms["tDiffuse"].value = causticsTarget2.texture;
              vblur.render(renderer);*/
            helper.visible = true;
            ground.visible = true;
            //   causticsMesh.visible = true;
            console.timeEnd();
            causticNeedsUpdate = false;
        }
        renderer.setRenderTarget(defaultTexture);
        renderer.clear();
        renderer.render(scene, camera);
        effectPass.uniforms["sceneDiffuse"].value = defaultTexture.texture;
        composer.render();
        controls.update();
        stats.update();
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}
main();