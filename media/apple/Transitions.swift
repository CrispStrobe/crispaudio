// MIT — native picture transitions. Coordinates are on the fitted output canvas.
import Foundation
import CoreImage
import Metal

final class PictureTransitions {
    static let names: Set<String> = ["cut", "fade", "fadeblack", "fadewhite", "wipeleft", "wiperight", "wipeup", "wipedown", "slideleft", "slideright", "slideup", "slidedown", "hblur", "zoomin", "pixelize", "whip", "glitch", "pagepeel"]
    // Compile once in the helper process, not per frame. macOS 12+ system compiler.
    private static let custom: Result<CIKernel, Error> = Result {
        guard let device=MTLCreateSystemDefaultDevice(),device.supportsDynamicLibraries else {
            throw NSError(domain:"CrispAudio",code:1,userInfo:[NSLocalizedDescriptionKey:"Whip, glitch and page peel require a Metal GPU with dynamic library support. Choose the optional FFmpeg backend on this Mac."])
        }
        let kernels = try CIKernel.kernels(withMetalString: """
        #include <CoreImage/CoreImage.h>
        extern "C" { namespace coreimage {
        float4 at(sampler image, float2 point, float2 size) {
            return image.sample(image.transform(clamp(point, float2(0.5), size-float2(0.5))));
        }
        [[stitchable]] float4 pictureTransition(sampler a, sampler b, float w, float h, float p, float kind, destination dest) {
            float2 q=dest.coord(), size=float2(w,h);
            const float pi=3.141592653589793;
            if (kind<0.5) {
                float progress=p*p*(3.0-2.0*p), blur=w*0.04*sin(pi*p);
                float4 value=float4(0.0);
                for (int i=-2;i<=2;i++) {
                    float x=q.x+w*progress+float(i)*blur*0.5;
                    value += x<w ? at(a,float2(x,q.y),size) : at(b,float2(x-w,q.y),size);
                }
                return value/5.0;
            }
            if (kind<1.5) {
                float band=floor((h-q.y)/12.0), tick=floor(p*24.0);
                float wave=w*0.12*sin(pi*p);
                float xr=fmod(q.x+wave*sin(band*9.0+tick*7.0)+w,w);
                float xg=fmod(q.x+wave*sin(band*9.0+tick*7.0+2.0)+w,w);
                float xb=fmod(q.x+wave*sin(band*9.0+tick*7.0+4.0)+w,w);
                if(p<0.5) return float4(at(a,float2(xr,q.y),size).r,at(a,float2(xg,q.y),size).g,at(a,float2(xb,q.y),size).b,1.0);
                return float4(at(b,float2(xr,q.y),size).r,at(b,float2(xg,q.y),size).g,at(b,float2(xb,q.y),size).b,1.0);
            }
            float edge=w*(1.0-p), band=w*0.15*sin(pi*p);
            if(q.x>edge) return at(b,q,size);
            if(band>0.001 && q.x>edge-band) {
                float4 reflected=at(a,float2(2.0*edge-q.x,q.y),size);
                float grey=dot(reflected.rgb,float3(0.213,0.715,0.072));
                float shade=0.55+0.4*cos((q.x-edge+band)/band*pi/2.0);
                return float4(float3(grey*shade),1.0);
            }
            return at(a,q,size);
        }
        }}
        """)
        guard let kernel=kernels.first(where: {$0.name=="pictureTransition"}) else {throw NSError(domain:"CrispAudio",code:1,userInfo:[NSLocalizedDescriptionKey:"Native transition kernel is missing"])}
        return kernel
    }
    private static func alpha(_ image: CIImage, _ value: Double) -> CIImage {
        image.applyingFilter("CIColorMatrix", parameters:["inputAVector":CIVector(x:0,y:0,z:0,w:value)])
    }
    private static func dissolve(_ a: CIImage, _ b: CIImage, _ p: Double) -> CIImage {
        alpha(b,p).composited(over:a)
    }
    static func render(_ a: CIImage, _ b: CIImage, kind: String, progress: Double, rect: CGRect) throws -> CIImage {
        let p=max(0,min(1,progress)),w=rect.width,h=rect.height
        if p<=0 {return a}; if p>=1 || kind=="cut" {return b}
        switch kind {
        case "fade": return dissolve(a,b,p)
        case "fadeblack", "fadewhite":
            let background=CIImage(color:kind=="fadewhite" ? .white:.black).cropped(to:rect)
            return p<0.5 ? alpha(a,1-2*p).composited(over:background) : alpha(b,2*p-1).composited(over:background)
        case "wipeleft", "wiperight", "wipeup", "wipedown":
            let crop: CGRect
            switch kind {
            case "wipeleft": crop=CGRect(x:w*(1-p),y:0,width:w*p,height:h)
            case "wiperight": crop=CGRect(x:0,y:0,width:w*p,height:h)
            case "wipeup": crop=CGRect(x:0,y:0,width:w,height:h*p)
            default: crop=CGRect(x:0,y:h*(1-p),width:w,height:h*p)
            }
            return b.cropped(to:crop).composited(over:a)
        case "slideleft", "slideright", "slideup", "slidedown":
            let horizontal=kind=="slideleft" || kind=="slideright"
            let direction:Double=kind=="slideleft" || kind=="slidedown" ? 1:-1
            let length=horizontal ? w:h
            let out=CGFloat(-direction*p)*length, into=CGFloat(direction*(1-p))*length
            return b.transformed(by:CGAffineTransform(translationX:horizontal ? into:0,y:horizontal ? 0:into)).composited(over:a.transformed(by:CGAffineTransform(translationX:horizontal ? out:0,y:horizontal ? 0:out)))
        case "hblur":
            let radius=min(w,h)*0.04*sin(Double.pi*p)
            func blur(_ image: CIImage)->CIImage {image.clampedToExtent().applyingFilter("CIMotionBlur",parameters:["inputRadius":radius,"inputAngle":0]).cropped(to:rect)}
            return dissolve(blur(a),blur(b),p)
        case "zoomin":
            let factor=1+p
            let zoom=a.transformed(by:CGAffineTransform(translationX:-w/2,y:-h/2)).transformed(by:CGAffineTransform(scaleX:factor,y:factor)).transformed(by:CGAffineTransform(translationX:w/2,y:h/2)).cropped(to:rect)
            return dissolve(zoom,b,p)
        case "pixelize":
            return dissolve(a,b,p).clampedToExtent().applyingFilter("CIPixellate",parameters:["inputScale":max(1,min(w,h)*0.15*sin(Double.pi*p)),"inputCenter":CIVector(x:w/2,y:h/2)]).cropped(to:rect)
        case "whip", "glitch", "pagepeel":
            let kernel=try custom.get(),number=kind=="whip" ? 0.0:kind=="glitch" ? 1.0:2.0
            guard let result=kernel.apply(extent:rect,roiCallback:{_,_ in rect},arguments:[a,b,w,h,p,number]) else {throw NSError(domain:"CrispAudio",code:1,userInfo:[NSLocalizedDescriptionKey:"Native transition rendering failed"])}
            return result
        default: throw NSError(domain:"CrispAudio",code:1,userInfo:[NSLocalizedDescriptionKey:"Unsupported native transition: \(kind)"])
        }
    }
}
