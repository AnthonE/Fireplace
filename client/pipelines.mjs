// A renderer's pipelines, compiled together and off the GPU process's main
// thread. createRenderPipeline compiles in line: nothing the page sends the
// GPU after it (the room's frame, a capture, another renderer's buffers) is
// looked at until the compile is done, so a renderer made as Fireplace
// switched games held the page's GPU there. createRenderPipelineAsync hands
// each compile to the GPU process's worker threads and answers when it is
// done, so a renderer can be made while another draws: Fireplace makes the
// next game's during this one (a frontend's warm(), client/host.mjs
// renderer()), and a page with one game waits here as it always did.
//
// Then each is drawn with once, a triangle into one scratch pixel of its
// own targets' formats: a GPU may leave part of a pipeline's making to its
// first draw (SwiftShader builds a pipeline's routines there), and this way
// that draw is not the game's first frame.
//   descs: { name: a GPURenderPipelineDescriptor }; resolves to { name: its GPURenderPipeline }
//   bind(pass, desc): sets what desc's pipeline needs before it can draw (its bind groups, a vertex buffer)
export async function compile(device, descs, bind) {
  const names = Object.keys(descs);
  const made = await Promise.all(names.map((n) => device.createRenderPipelineAsync(descs[n])));
  const enc = device.createCommandEncoder();
  const scratch = [];
  const pixel = (format, sampleCount) => {
    const t = device.createTexture({ size: [1, 1], format, sampleCount, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    scratch.push(t);
    return t.createView();
  };
  names.forEach((n, k) => {
    const d = descs[n], count = d.multisample?.count ?? 1;
    const pass = enc.beginRenderPass({
      colorAttachments: (d.fragment?.targets ?? []).map((t) => ({ view: pixel(t.format, count), loadOp: 'clear', storeOp: 'discard' })),
      ...(d.depthStencil && { depthStencilAttachment: { view: pixel(d.depthStencil.format, count), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } }),
    });
    bind(pass, d);
    pass.setPipeline(made[k]);
    pass.draw(3);
    pass.end();
  });
  device.queue.submit([enc.finish()]);
  for (const t of scratch) t.destroy();
  return Object.fromEntries(names.map((n, k) => [n, made[k]]));
}
