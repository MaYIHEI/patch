// loon-panel / net.ts
// NAT 类型: Loon 脚本收发不了 UDP, 这里用网页组件跑 WebRTC 向两个 STUN 服务器要映射地址;
// 请求走手机当前的路由, 所以测的是分流规则下实际走的那条线, 不能指定节点

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
}

const NAT_KEY = 'loonpanel.nat'
export type Nat = { t: number; type: 'cone' | 'symmetric' | 'blocked' | 'unknown'; text: string }
export const lastNat = () => AppStorage.get<Nat>(NAT_KEY)

const HTML = '<!doctype html><title>nat</title>'
const PROBE = `
return new Promise(resolve => {
  const ports = {}
  const done = () => { try { pc.close() } catch (e) {} ; resolve(JSON.stringify(ports)) }
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] })
  pc.createDataChannel('x')
  pc.onicecandidate = e => {
    if (!e.candidate) return done()
    const m = e.candidate.candidate.match(/ (\\d+) typ srflx raddr (\\S+) rport (\\d+)/)
    if (m) (ports[m[3]] = ports[m[3]] || []).push(m[1])
  }
  pc.createOffer().then(o => pc.setLocalDescription(o)).catch(done)
  setTimeout(done, 6000)
})`

/** 同一本地端口映射到同一外部端口 = 锥形; 不同 = 对称; 没有映射 = UDP 不通 */
export function natFrom(raw: string, t = Date.now()): Nat {
  const ports = JSON.parse(raw) as Record<string, string[]>
  const lists = Object.values(ports)
  if (!lists.length) return { t, type: 'blocked', text: 'UDP 不通或节点不支持 UDP' }
  if (lists.some(l => new Set(l).size > 1)) return { t, type: 'symmetric', text: '对称型 NAT' }
  if (lists.every(l => l.length < 2)) return { t, type: 'unknown', text: 'UDP 通, 类型未判定' }
  return { t, type: 'cone', text: '锥形 NAT' }
}

export async function checkNat(): Promise<Nat> {
  const web = new WebViewController()
  try {
    await web.loadHTML(HTML, 'https://localhost/')
    const nat = natFrom(String(await web.evaluateJavaScript(PROBE)))
    AppStorage.set(NAT_KEY, nat)
    return nat
  } finally {
    web.dispose()
  }
}
