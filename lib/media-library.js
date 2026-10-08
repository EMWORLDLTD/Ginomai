'use strict';

function asBackground(asset) {
  const first=asset.pages?.[1];
  if(asset.kind==='pdf' && !first?.url) return null;
  const video=asset.kind==='video';
  return {id:asset.id,name:asset.name,type:video?'video':'image',category:video?'motion':'still',custom:true,
    width:first?.width || asset.width,height:first?.height || asset.height,size:asset.size,createdAt:asset.createdAt,
    textColor:'#FFFFFF',headerColor:'#FFFFFF',textShadow:'0 2px 12px #000',font:'Outfit',previewGradient:'#171722',
    [video?'videoUrl':'imageUrl']:asset.kind==='pdf'?first.url:asset.url};
}

function asPresentation(background) {
  return {id:background.id,name:background.name,kind:background.type,url:background.videoUrl || background.imageUrl,
    width:background.width,height:background.height,size:background.size,createdAt:background.createdAt,
    pageCount:1,pages:{},ready:background.type==='video'};
}

module.exports={asBackground,asPresentation};
